# False DDP frame expiry

The test reproduces a timestamp race in the new complete-frame receiver.
The main loop samples time before it acquires the queue lock.
A concurrent receiver can publish a newer timestamp before that lock becomes available.
Unsigned subtraction then treats the older sample as a very large elapsed interval.
The queue immediately discards fresh staging data or a ready frame.

This defect remains uncorrected. Its contribution to physical frame drops is unmeasured.
Firmware2609051 does not use this receiver and remains installed.
Candidate2609098 still contains this receiver defect and must not be considered ready for another physical trial.

Run the reproduction against the tracked header:

```sh
c++ -std=c++17 -Wall -Wextra -Werror -Ifirmware/ddp-dma firmware/ddp-expiry/test-expiry.cpp -o /tmp/loo-ddp-expiry-test
/tmp/loo-ddp-expiry-test
```

The test expects the current defect and checks valid timeout and clock-wrap behavior.
When the receiver is corrected, change the assertions to require preservation of fresh frames.
Prefer sampling time under the same queue lock. Preserve deterministic clock tests.
