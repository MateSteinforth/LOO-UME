# False DDP frame expiry

The test reproduces a timestamp race in the new complete-frame receiver.
The main loop samples time before it acquires the queue lock.
A concurrent receiver can publish a newer timestamp before that lock becomes available.
Unsigned subtraction then treats the older sample as a very large elapsed interval.
The queue immediately discards fresh staging data or a ready frame.

Firmware2609099 corrects this defect and retains the DMA descriptor correction from2609098.
The timeout check rejects negative modular ages from stale snapshots.
It still expires data at100ms and handles clock wrap.
The comparison assumes queue ages below half the32-bit microsecond range, about35.8 minutes.
The normal queue lifetime is100ms; realtime exit and configuration reset discard its data.
Physical throughput and flash suppression require device checks.

Apply the pinned patch to an independent copy of2609098, then run the regression:

```sh
python3 firmware/ddp-expiry/patch.py build/firmware-source
c++ -std=c++17 -Wall -Wextra -Werror -Ibuild/firmware-source/wled00 firmware/ddp-expiry/test-expiry.cpp -o /tmp/loo-ddp-expiry-test
/tmp/loo-ddp-expiry-test
python3 firmware/ddp-dma/test-service.py build/firmware-source
```

The regression requires preservation of fresh ready and staging frames through both expiry entry points.
It also checks assembly completion, the timeout boundary, and normal and stale clock-wrap cases.
The service harness compiles the selected candidate's actual receiver and queue header.

Build with the isolated PlatformIO environment and generate the `compiledb` target.
Then run `python3 firmware/ddp-expiry/verify.py` to reconstruct the source and verify the image.
The task board records the device state and physical acceptance.
