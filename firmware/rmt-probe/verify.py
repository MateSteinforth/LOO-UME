#!/usr/bin/env python3
"""Verify local-driver ownership, ISR placement, baseline timings and fallbacks."""
from pathlib import Path
import hashlib
import json
import re
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
source = root / 'build/firmware-source'
core = root / 'build/firmware-toolchain/core'
build = source / '.pio/build/orbital_esp32dev'
elf = build / 'firmware.elf'
binutils = core / 'tools/toolchain-xtensa-esp-elf/bin'
npb = source / '.pio/libdeps/orbital_esp32dev/NeoPixelBus@src-4b5e4ea50d167e690e5eb220fdd3f575'
def sha(path): return hashlib.sha256(path.read_bytes()).hexdigest()
def run(tool, *args): return subprocess.check_output([str(binutils / ('xtensa-esp32-elf-' + tool)), *map(str,args)], text=True)

fallbacks = {
    '/tmp/loo-ume-audio-rmt-iram/build/firmware-audioreactive/wled-audioreactive-rmt4-esp32.bin': '2d2194e8617d077d4f85567484eda801b0abe9249fca52c7fa8c852f7e6cd1e2',
    '/home/mate/Documents/led-rhombicosidodecahedron/build/firmware-rmt4-2609051/wled-orbital-esp32dev.bin': 'f84dbc5015dab45ada68e53a5968732458f19ae2b993238cfc183d2ca87aae55',
    '/tmp/loo-ume-rmt-reset-gap-test/build/firmware-reset-gap/wled-nonaudio-reset300-2609093.bin': '752e485c34433d8dc3a1132d605e34618c919654f1ebf46b8b78fb63a3054f71',
}
for path, digest in fallbacks.items(): assert sha(Path(path)) == digest, path
sdk = core / 'packages/framework-arduinoespressif32/tools/esp32-arduino-libs/esp32'
archive = sdk / 'lib/libesp_driver_rmt.a'
assert sha(archive) == '1063997f77febadc4b38b79880759cec95128164a96cd4897571009dd111dfe6'
assert sha(source / 'wled00/rmt_private.h') == 'bf0e0256bbcc87129d532a4d4d8606e2f3bf818c50ccec96637514357a2d89d2'
assert '#define VERSION 2609094' in (source/'wled00/wled.h').read_text()
assert (source/'platformio_override.ini').read_bytes() == (root/'firmware/wled-platformio.ini').read_bytes()
baseline = json.loads((root/'firmware/build-receipt.json').read_text())
assert sha(source/'platformio_override.ini') == baseline['inputs']['platformioOverrideSha256']
for name in ('loo_rmt_probe.c','loo_rmt_probe.h','loo_rmt_probe_json.cpp'):
    assert (source/'wled00'/name).read_bytes() == (root/'firmware/rmt-probe'/name).read_bytes()

commands = json.loads((source/'compile_commands.json').read_text())
assert not any('UM_AUDIOREACTIVE_ENABLE' in str(c) or 'usermods/audioreactive/' in c['file'] for c in commands)
for name in ('loo_rmt_probe.c','loo_probe_rmt_tx.c','loo_rmt_probe_json.cpp'):
    assert any(c['file'].endswith('wled00/'+name) for c in commands), name
mapping = (build/'firmware.map').read_text()
# Any reference to an extracted old object is forbidden; the ordinary LOAD
# libesp_driver_rmt.a line remains and supplies its common/encoder/RX objects.
assert 'libesp_driver_rmt.a(rmt_tx.c.obj)' not in mapping
tx_object = build/'src/loo_probe_rmt_tx.c.o'
tx_symbols = re.findall(r'^[0-9a-f]+ T (\w+)$', run('nm',tx_object), re.M)
assert len(tx_symbols) == 8, tx_symbols
for symbol in tx_symbols:
    # LTO can emit a merged ltrans object. Its cross-reference table must still
    # name our source object (possibly on a continuation line).
    entry = re.search(r'^'+symbol+r'\s+.*(?:\n[ \t]+.*)*',mapping,re.M)
    assert entry and 'src/loo_probe_rmt_tx.c.o (symbol from plugin)' in entry[0], symbol
symbols = run('nm','-S','-C',elf)
assert 'AudioReactive::' not in symbols and 'FFTcode(' not in symbols
iram = {}
for name in ('loo_probe_start','loo_probe_threshold_begin','loo_probe_threshold_end','loo_probe_done'):
    match = re.search(r'^([0-9a-f]+) ([0-9a-f]+) [tT] '+name+'$',symbols,re.M)
    assert match and 0x40080000 <= int(match[1],16) < 0x400c0000, name
    iram[name] = {'address':'0x'+match[1], 'bytes':int(match[2],16)}
probe_disassembly = ''
for record in iram.values():
    start = int(record['address'],16)
    stop = start + record['bytes']
    # Xtensa relaxation leaves zero padding after unconditional jumps. A linear
    # decode can invent calls across that padding. Follow reachable basic
    # blocks and restart decoding at branch targets instead.
    pending, seen, lines = [start], set(), []
    while pending:
        address = pending.pop()
        if address in seen: continue
        seen.add(address)
        block = run('objdump','-d',f'--start-address={address}',f'--stop-address={stop}',elf)
        for line in block.splitlines():
            insn = re.match(r'^\s*([0-9a-f]+):\s+[0-9a-f]+\s+(\S+)\s*(.*)',line)
            if not insn: continue
            opcode,args = insn[2],insn[3]
            lines.append(line)
            target = re.search(r'\b([0-9a-f]{8})\s+<',args)
            if opcode.startswith('call'):
                assert target and 0x40080000 <= int(target[1],16) < 0x400c0000, line
            if opcode == 'j' or opcode.startswith('b'):
                if target:
                    dest = int(target[1],16)
                    assert start <= dest < stop, line
                    pending.append(dest)
            if opcode == 'j' or opcode.startswith('ret'): break
    section = '\n'.join(lines)+'\n'
    assert not re.search(r'esp_rom_crc|printf|malloc|memset|esp_log|__atomic_',section), section
    probe_disassembly += section
for name in ('control_word','gpio_slots','gpio_ids','timings','payloads','events','timing_private','payload_private'):
    match = re.search(r'^([0-9a-f]+) [0-9a-f]+ [bBdD] '+name+r'(?:\$lto_priv\$\d+)?$',symbols,re.M)
    assert match and 0x3ff80000 <= int(match[1],16) < 0x40000000, name
pattern = r'^([0-9a-f]+) ([0-9a-f]+) [tT] NeoEsp32RmtMethodBase<NeoEsp32RmtSpeedWs2812x, NeoEsp32RmtNotInverted>::Initialize\(\)$'
match = re.search(pattern,symbols,re.M)
assert match
start,size = (int(v,16) for v in match.groups())
assembly = run('objdump','-d','-C',f'--start-address={start}',f'--stop-address={start+size}',elf)
for value in ('17701770','2625a00','228010','128020'): assert value in assembly, value
assert '3e803e8' not in assembly
image = build/'firmware.bin'
assert image.read_bytes()[0] == 0xe9 and image.stat().st_size < 0x1f0000
out = root/'build/firmware-rmt-probe'
out.mkdir(exist_ok=True)
name = 'wled-nonaudio-rmtprobe-2609094.bin'
shutil.copyfile(image,out/name)
shutil.copyfile(elf,out/'firmware.elf')
(out/'probe-disassembly.txt').write_text(probe_disassembly)
(out/'ws2812x-initialize.txt').write_text(assembly)
inputs = {str(p.relative_to(source)): sha(p) for p in [
    source/'wled00/wled.h',source/'wled00/json.cpp',source/'wled00/loo_probe_rmt_tx.c',
    source/'wled00/rmt_private.h',source/'wled00/loo_rmt_probe.c',source/'wled00/loo_rmt_probe.h',source/'wled00/loo_rmt_probe_json.cpp',
    npb/'src/internal/methods/ESP/ESP32/NeoEsp32RmtXMethod.h',source/'compile_commands.json']}
receipt = {
    'status':'built-not-installed','buildId':2609094,'baselineBuildId':2609093,
    'wledCommit':baseline['target']['wledCommit'],'neoPixelBusCommit':baseline['inputs']['neopixelBus']['commit'],
    'idfCommit':'b3b492ffc273f17f4ed3c83c19ed110cd6c73c7a',
    'originalDriverSha256':'26227799fa83cfcc155e8e591e91d87822308519291bb8689007d7b0aa281f79',
    'sdkArchiveSha256':sha(archive),'audioCompiled':False,'rmtSymbolsPerOutput':128,
    'rmtClockHz':40000000,'resetMicroseconds':300,'txSymbolsFromLocalObject':tx_symbols,
    'probeIsrSymbols':iram,'inputs':inputs,'elfSha256':sha(elf),'fallbacks':fallbacks,
    'artifact':{'name':name,'byteLength':image.stat().st_size,'sha256':sha(image)},
}
encoded = json.dumps(receipt,indent=2)+'\n'
(out/'build-receipt.json').write_text(encoded)
(root/'firmware/rmt-probe/build-receipt.json').write_text(encoded)
print(encoded)
