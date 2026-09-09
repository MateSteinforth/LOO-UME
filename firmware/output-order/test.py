#!/usr/bin/env python3
"""Guarded configuration-only allocation test; retain physical pixel routing."""
from pathlib import Path
import copy
import datetime
import hashlib
import json
import sys
import urllib.request

ROOT=Path(__file__).resolve().parents[2]
DIRECTORY=ROOT/'build/device-test'
BASE='http://192.168.68.53/'
PINS=[16,17,21,22]
TEST_PINS=[16,22,21,17]

def save(name,data):
    path=DIRECTORY/name
    path.write_bytes(data if isinstance(data,bytes) else json.dumps(data).encode())
    path.chmod(0o600)

def read(endpoint):
    with urllib.request.urlopen(BASE+endpoint,timeout=12) as response: return json.load(response)

def info():
    result=read('json/info')
    assert result['mac']=='2462abc9f3a8' and result['vid']==2609094
    assert not result['rmtprobe']['enabled'] and not result['rmtprobe']['crc']
    return result

def post(payload):
    request=urllib.request.Request(BASE+'json/cfg',data=json.dumps(payload).encode(),headers={'Content-Type':'application/json'})
    with urllib.request.urlopen(request,timeout=15) as response: return response.read()

def wiring(buses):
    return sorted((bus['pin'][0],bus['start']+i,i) for bus in buses for i in range(bus['len']))

def expected(test, serialized=False):
    before=json.loads((DIRECTORY/'before-cfg.json').read_text())
    if test:
        buses=before['hw']['led']['ins']
        by_pin={bus['pin'][0]:bus for bus in buses}
        after=[by_pin[pin] for pin in TEST_PINS]
        assert wiring(buses)==wiring(after)
        before['hw']['led']['ins']=after
    if serialized:
        # A non-audio serializer writes its own vid and cannot re-emit an
        # uncompiled usermod. Restore the exact original file after this test.
        before['vid']=2609094
        before.get('um',{}).pop('AudioReactive',None)
    return before

action=sys.argv[1]
if action=='prepare':
    DIRECTORY.mkdir(parents=True,exist_ok=False,mode=0o700)
    observed=info(); assert observed['live'] and observed['lm']=='DDP'
    for name,endpoint in [('cfg','cfg.json'),('state','json/state'),('map','ledmap.json')]: save('before-'+name+'.json',read(endpoint))
    save('before-info.json',observed)
    before=expected(False)
    buses=before['hw']['led']['ins']
    assert [b['pin'][0] for b in buses]==PINS
    assert [(b['start'],b['len']) for b in buses]==[(0,704),(704,640),(1344,640),(1984,640)]
    after=expected(True)
    assert len(wiring(buses))==2624
    save('apply.json',{'hw':{'led':{'ins':after['hw']['led']['ins']}}})
    save('restore.json',{'hw':{'led':{'ins':buses}}})
    fallback=Path('/tmp/loo-ume-audio-rmt-iram/build/firmware-audioreactive/wled-audioreactive-rmt4-esp32.bin')
    assert hashlib.sha256(fallback.read_bytes()).hexdigest()=='2d2194e8617d077d4f85567484eda801b0abe9249fca52c7fa8c852f7e6cd1e2'
    print('Prepared exact apply/restore; all2624 GPIO/address pairs preserved;2609085 intact.')
elif action in ('apply','restore'):
    info()
    current=read('cfg.json')
    # Restore accepts either expected ordering; do not overwrite unrelated changes.
    assert current in [expected(False),expected(True,True),expected(False,True)], 'Unexpected configuration change'
    if action=='apply':
        payload=json.loads((DIRECTORY/'apply.json').read_text())
        reply=post(payload)
    else:
        # The supported cfg.json upload restores unknown inactive usermods too
        # and reboots. Use only the exact privately saved configuration.
        boundary='loo-output-order-restore'
        data=(DIRECTORY/'before-cfg.json').read_bytes()
        body=(f'--{boundary}\r\nContent-Disposition: form-data; name="data"; filename="cfg.json"\r\nContent-Type: application/json\r\n\r\n'.encode()+data+f'\r\n--{boundary}--\r\n'.encode())
        request=urllib.request.Request(BASE+'upload',data=body,headers={'Content-Type':'multipart/form-data; boundary='+boundary})
        with urllib.request.urlopen(request,timeout=15) as response: reply=response.read()
    save(action+'-response.json',reply)
    save(action+'-time.json',datetime.datetime.now(datetime.timezone.utc).isoformat())
    print(action,'sent',datetime.datetime.now(datetime.timezone.utc).isoformat())
elif action=='verify':
    label=sys.argv[2]; test=label!='restored'
    assert label.replace('-','').isalnum()
    observed=info()
    save(label+'-info.json',observed)
    for name,endpoint in [('cfg','cfg.json'),('state','json/state'),('map','ledmap.json')]:
        value=read(endpoint); save(label+'-'+name+'.json',value)
        old=json.loads((DIRECTORY/('before-'+name+'.json')).read_text())
        if name=='cfg': assert value==expected(test,serialized=test), 'Configuration differs beyond documented serializer normalization/order'
        elif name=='map': assert value==old, 'Mapping changed'
        else:
            for key in ('on','bri','mainseg','ledmap','lor','seg'):
                assert value[key]==old[key], 'State changed: '+key
    expected_pins=TEST_PINS if test else PINS
    channels=observed['rmtprobe']['channels']
    assert [(c['channel'],c['gpio']) for c in channels]==list(zip([0,2,4,6],expected_pins)), 'RMT allocation differs'
    assert observed['live'] and observed['lm']=='DDP', 'DDP not active'
    save(label+'-time.json',datetime.datetime.now(datetime.timezone.utc).isoformat())
    print(label,'verified:',list(zip([0,2,4,6],expected_pins)),'DDP active; per-pin settings/map/state unchanged')
else: raise SystemExit('Use prepare, apply, restore or verify LABEL (restored for original)')
