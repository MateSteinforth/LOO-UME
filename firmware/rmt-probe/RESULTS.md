# Diagnostic2609094: first timing observation

Installed2026-09-09, controllerMAC2462abc9f3a8 at192.168.68.53. Read-back
confirmed unchanged full configuration exceptvid, map and brightness, with
DDP active. Timing collection enabled08:41:29.856UTC, CRC disabled.
Private before/after snapshots are under
`build/device-test-20260909-083639` in the task worktree.

After more than90seconds settling, the physical observation was announced
around08:43:30UTC. The subsequent clock read was08:43:35UTC; its60-second
deadline was08:44:35UTC. The stop check was08:44:40UTC, so the stop was about
5seconds late. User estimates, not exact one-minute counts:

| Output | User observation |
| --- | --- |
| GPIO22 | One flash every1–2seconds |
| GPIO16 | One flash every4–5seconds |
| GPIO17/21 | No new chain-specific report in this window |

The telemetry snapshots span120.936579seconds, wider than the physical window.
They must not be labelled counters from the exact visual observation. CPU
reported240MHz throughout, DDP active, controller uptime119→240seconds.

| GPIO | Transactions | Gaps over160us | Target-half entries | Invalid cursor | Raw error samples |
| --- | ---: | ---: | ---: | ---: | ---: |
|16|5628|2|750|0|0|
|17|5628|2|811|0|0|
|21|5628|1|460|0|0|
|22|5628|1|216|0|0|

Values above are differences between the two snapshots. Target-half entries
are not independent damaged-frame counts; one phase error can affect many
subsequent refills. The bounded event ring records only the first two flagged
entries per transaction. Normal cursor histograms cluster at the expected0/64
positions on alternate halves. Stored anomalous events include an entry in the
target half paired with a gap longer than the full160us ring, supporting late
refill service under this diagnostic.

Cumulative maxima since arming were178.037/182.338/171.125/166.400us for entry
gaps onGPIO16/17/21/22. Encoder intervals, including entry-probe work, reached
21.217/28.517/26.054/28.929us. Maximum measured probe entry or exit work was
about1.2–1.3us. These maxima are not necessarily from the same event. Raw error,
wait error and transmit error counters were zero. CRC checks were disabled;
zero mutation counters do not establish buffer integrity.

The snapshot interval averages about46.54 output transactions/second; WLED
reported47 then46FPS. This is controller transmission rate, not sender FPS,
unique complete DDP frames, smooth motion or a frame-drop count.

## Conclusion and same-binary control

Delayed refill service was observed. It supports an output timing mechanism,
but the observed severe events are too sparse to account for every reported
flash, especiallyGPIO22. First-threshold delays, consumption during encoding,
observer effects and downstream signal faults remain unexcluded. Do not label
this a complete explanation or a flicker fix.

Collection disabled08:46:42.203UTC on the same binary, CRC still disabled.
After at least90seconds settling, the second observation started around
08:48:35UTC (clock read08:48:38) and ended08:49:38UTC. No controller polling
occurred during this minute. The operator reportedGPIO22 every1–2seconds;
all other chains, explicitly includingGPIO16, had no flashes during this
window. This is a one-minute result, not a long-term stability claim.

GPIO22's frequent flashes persisted with collection off. GPIO16's improvement
could reflect instrumentation effects or the time variation seen before the
installation. No additional flash was performed. A separate CRC sample was
enabled08:50:34.903UTC to check task-buffer integrity; no further physical
count was requested, and its timing is not directly comparable because CRC
work staggers output starts.

## Separate checksum sample and final state

CRC sample08:50:34.903–08:51:32.586UTC, about57.68seconds. Each output submitted
2647buffers and completed2646post-transmission comparisons. All four reported
zero submitted-buffer changes, zero in-flight mutations, zero wait errors and
zero transmit errors. GPIO16's repeated CRC was2911800801; each640-pixel
output's CRC was2581280169. Thus these task buffers remained unchanged in this
sample. It is not a wire capture or a simultaneous account of the earlier
physical window.

Maximum task checksum intervals per output were282.67/294.49/361.84/506.80us
forGPIO16/17/21/22. They include interrupts/preemption; this work can materially
stagger output starts. No physical improvement is attributed to the checksum
run. Collection disabled again08:51:32.746UTC. Controller remains2609094 with
CRC and timing collection off. The2609085,2609051 and2609093 images are intact.

The frequentGPIO22 fault remains unexplained. Stable submitted buffers and
the observed rare stale-refill events narrow the investigation, but neither
proves the complete cause. A later investigation must account for the observed
GPIO22 rate and distinguish symbol encoding/timing from downstream signalling.
Motion/frame drops and restored audio-reactive operation remain untested here.
