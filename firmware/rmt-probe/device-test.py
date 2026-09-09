#!/usr/bin/env python3
"""Bounded local-controller OTA/read-back for the authorized diagnostic test.

Run only on the intended LAN device after code/image review. Full private
backups stay below ignored build/. This does not alter saved settings.
"""
from pathlib import Path
import datetime
import hashlib
import json
import sys
import urllib.request

root = Path(__file__).resolve().parents[2]
directory = root / (root/'build/current-device-test.txt').read_text().strip()
contract = json.loads((directory/'test.json').read_text())
base = 'http://' + contract['ip'] + '/'

def fetch(endpoint, data=None, headers=None, timeout=12):
    request = urllib.request.Request(base+endpoint,data=data,headers=headers or {})
    with urllib.request.urlopen(request,timeout=timeout) as response: return response.read()

def save(name, data):
    path=directory/name
    path.write_bytes(data)
    path.chmod(0o600)

def info():
    obj=json.loads(fetch('json/info'))
    assert obj['mac']==contract['mac'], 'Unexpected controller'
    return obj

action=sys.argv[1]
if action=='install':
    assert info()['vid']==contract['from'], 'Unexpected starting firmware'
    receipt=json.loads((root/'firmware/rmt-probe/build-receipt.json').read_text())
    image=(root/'build/firmware-rmt-probe'/receipt['artifact']['name']).read_bytes()
    assert hashlib.sha256(image).hexdigest()==receipt['artifact']['sha256']
    for path, digest in receipt['fallbacks'].items():
        assert hashlib.sha256(Path(path).read_bytes()).hexdigest()==digest
    boundary='loo-rmt-probe-2609094-ota'
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="update"; filename="firmware.bin"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode()
          +image+f'\r\n--{boundary}--\r\n'.encode())
    reply=fetch('update',body,{'Content-Type':'multipart/form-data; boundary='+boundary},timeout=55)
    save('update-response.html',reply)
    print('OTA HTTP response saved:',len(reply),'bytes')
elif action=='verify':
    observed=info()
    assert observed['vid']==contract['to'],observed.get('vid')
    save('after-info.json',json.dumps(observed).encode())
    for name, endpoint in [('cfg','cfg.json'),('map','ledmap.json'),('state','json/state')]:
        data=fetch(endpoint); after=json.loads(data)
        save('after-'+name+'.json',data)
        before=json.loads((directory/('before-'+name+'.json')).read_text())
        if name=='cfg':
            before.pop('vid',None); after.pop('vid',None)
            assert before==after, 'Configuration changed'
        elif name=='map': assert before==after, 'Mapping changed'
        else: assert before['bri']==after['bri'], 'Brightness changed'
    print(json.dumps({'vid':observed['vid'],'live':observed.get('live'),'lm':observed.get('lm'),'uptime':observed['uptime'],'configuration':'unchanged except build ID','mapping':'unchanged','brightness':'unchanged'}))
elif action in ('arm','crc','disable'):
    assert info()['vid']==contract['to']
    payload=json.dumps({'rmtprobe':{'enabled':action!='disable','crc':action=='crc'}}).encode()
    reply=fetch('json/state',payload,{'Content-Type':'application/json'})
    save(action+'-response.json',reply)
    print('Collection',action,'at',datetime.datetime.now(datetime.timezone.utc).isoformat())
elif action=='snapshot':
    label=sys.argv[2]
    assert label.replace('-','').isalnum()
    observed=info()
    assert observed['vid']==contract['to']
    save(label+'-info.json',json.dumps(observed).encode())
    now=datetime.datetime.now(datetime.timezone.utc).isoformat()
    save(label+'-time.txt',now.encode())
    print(json.dumps({'time':now,'vid':observed['vid'],'live':observed.get('live'),'lm':observed.get('lm'),'uptime':observed['uptime'],'rmtprobe':observed.get('rmtprobe')}))
else:
    raise SystemExit('Use install, verify, arm, crc, disable or snapshot LABEL')
