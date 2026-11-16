#!/usr/bin/env python3
"""Summarize FIRM-044 DDP timing from saved /json/info files. This script does not contact a device."""
import json
from pathlib import Path
import sys

HISTOGRAMS = (
    ("arrival", "complete-frame interval at the receiver"),
    ("assembly", "first packet to PUSH packet"),
    ("wait_idle", "wait after completion while the presenter was idle (main loop)"),
    ("wait_busy", "wait after completion while painting or sending"),
    ("paint", "setRealtimePixel copy"),
    ("show", "strip.show(), including any driver wait with overlap"),
    ("latency", "completion to transmission start"),
    ("wire", "transmission start to observed completion"),
    ("present", "interval between transmission starts"),
    ("loop", "main-loop time outside the DDP service"),
)


def percentile(histogram, edges, fraction):
    """Upper bin edge, in microseconds, that contains the requested fraction; None when empty."""
    total = histogram["n"]
    if not total:
        return None
    running = 0
    for index, count in enumerate(histogram["bins"]):
        running += count
        if running >= fraction * total:
            return edges[index] if index < len(edges) else histogram["max_us"]
    return histogram["max_us"]


def share_above(histogram, edges, limit_us):
    """Fraction of values in bins whose lower edge is at least limit_us."""
    total = histogram["n"]
    if not total:
        return 0.0
    count = sum(c for i, c in enumerate(histogram["bins"]) if i > 0 and edges[i - 1] >= limit_us)
    return count / total


def share_at_or_below(histogram, edges, limit_us):
    total = histogram["n"]
    if not total:
        return 0.0
    count = sum(c for i, c in enumerate(histogram["bins"]) if i < len(edges) and edges[i] <= limit_us)
    return count / total


def milliseconds(value):
    return "-" if value is None else f"{value / 1000:.1f}"


def missing_keys(info):
    ddp = info.get("loo_ddp", {})
    timing = ddp.get("timing", {})
    missing = [k for k in ("overlap_requested", "overlap_active", "timing") if k not in ddp]
    missing += [f"timing.{k}" for k in ("since_ms", "now_ms", "complete", "presented", "overlapped",
                                         "replaced_loop", "replaced_paint", "replaced_wire", "edges_us")
                if k not in timing]
    missing += [f"timing.{name}" for name, _ in HISTOGRAMS if name not in timing]
    return missing


def summarize(info):
    missing = missing_keys(info)
    if missing:
        # ArduinoJson drops members without an error when WLED's JSON document is full.
        raise ValueError("The timing block is not complete (firmware older than 2609103 or a full JSON "
                         "document). Missing: " + ", ".join(missing))
    ddp = info["loo_ddp"]
    timing = ddp["timing"]
    edges = timing["edges_us"]
    seconds = max((timing["now_ms"] - timing["since_ms"]) / 1000, 0.001)
    replaced = {k: timing[f"replaced_{k}"] for k in ("loop", "paint", "wire")}
    lines = [
        f"Firmware {info.get('vid')}; overlap requested {ddp['overlap_requested']}, active {ddp['overlap_active']}.",
        f"Window {seconds:.1f} s. Complete {timing['complete'] / seconds:.2f}/s. "
        f"Shown {timing['presented'] / seconds:.2f}/s "
        f"({100 * timing['presented'] / max(timing['complete'], 1):.1f}% of complete).",
        "Replaced per second: main loop {:.2f}, paint {:.2f}, serialized wire {:.2f}.".format(
            *(replaced[k] / seconds for k in ("loop", "paint", "wire"))),
        f"Paint started during a transmission: {timing['overlapped']} frames.",
        "Stage            n    avg ms  p50 ms  p90 ms  p99 ms  max ms",
    ]
    for name, _ in HISTOGRAMS:
        h = timing[name]
        lines.append(f"{name:<14}{h['n']:>6}  {milliseconds(h['avg_us'] if h['n'] else None):>6}  "
                     f"{milliseconds(percentile(h, edges, 0.5)):>6}  {milliseconds(percentile(h, edges, 0.9)):>6}  "
                     f"{milliseconds(percentile(h, edges, 0.99)):>6}  {milliseconds(h['max_us'] if h['n'] else None):>6}")
    return lines, diagnose(timing, edges)


def diagnose(timing, edges):
    """Indicators for the four candidate causes. They guide the next test; they do not prove a cause."""
    notes = []
    arrival = timing["arrival"]
    bunched = share_at_or_below(arrival, edges, 20000)
    gaps = share_above(arrival, edges, 50000)
    if arrival["n"] and bunched + gaps > 0.1:
        notes.append(f"Receive jitter: {100 * bunched:.0f}% of frames arrived within 20 ms and "
                     f"{100 * gaps:.0f}% after more than 50 ms.")
    total = sum(timing[f"replaced_{k}"] for k in ("loop", "paint", "wire"))
    if total:
        cause = max(("loop", "paint", "wire"), key=lambda k: timing[f"replaced_{k}"])
        label = {"loop": "main-loop scheduling", "paint": "paint and show time",
                 "wire": "serialized output (wait for the previous transmission)"}[cause]
        notes.append(f"Most replaced frames ({timing[f'replaced_{cause}']} of {total}) waited for {label}.")
    loop99 = percentile(timing["loop"], edges, 0.99)
    if loop99 is not None and loop99 > 8000:
        notes.append(f"Main loop: 1% of the time outside the DDP service is longer than {loop99 / 1000:.0f} ms.")
    paint = timing["paint"]
    if paint["n"] and paint["avg_us"] > 5000:
        notes.append(f"Paint copy averages {paint['avg_us'] / 1000:.1f} ms.")
    wire = timing["wire"]
    estimate = timing.get("wire_estimate_us", 0)
    if wire["n"] and estimate and wire["avg_us"] > estimate + 3000:
        notes.append(f"Completion is observed {(wire['avg_us'] - estimate) / 1000:.1f} ms after the "
                     "estimated wire time on average. The main loop checks late.")
    present = timing["present"]
    skips = share_above(present, edges, 50000)
    if present["n"]:
        notes.append(f"Output cadence: {100 * skips:.1f}% of transmission intervals are longer than 50 ms.")
    return notes


def self_test():
    edges = [500, 1000, 2000, 4000, 6000, 8000, 12000, 16000, 20000, 24000, 28000, 32000, 36000,
             40000, 50000, 67000, 100000]

    def histogram(bins, avg=0, maximum=0):
        full = bins + [0] * (18 - len(bins))
        return {"n": sum(full), "avg_us": avg, "max_us": maximum, "bins": full}

    empty = histogram([])
    arrival = histogram([0] * 12 + [80] + [0] * 3 + [20], 40000, 70000)
    timing = {
        "since_ms": 0, "now_ms": 10000, "wire_estimate_us": 21420, "complete": 300, "presented": 250,
        "overlapped": 0, "replaced_loop": 5, "replaced_paint": 0, "replaced_wire": 45, "edges_us": edges,
        "arrival": arrival, "assembly": empty, "wait_idle": empty, "wait_busy": empty,
        "paint": histogram([0, 0, 0, 0, 10], 5500, 6000), "show": empty, "latency": empty,
        "wire": histogram([0] * 9 + [10], 22000, 23000), "present": histogram([0] * 12 + [8, 0, 0, 2]),
        "loop": histogram([90, 9, 1], 400, 1500),
    }
    # 80 intervals in (32, 36] ms and 20 in (67, 100] ms.
    assert percentile(arrival, edges, 0.5) == 36000 and percentile(arrival, edges, 0.9) == 100000
    assert percentile(histogram([0] * 17 + [3], 0, 250000), edges, 0.5) == 250000
    assert percentile(empty, edges, 0.5) is None
    lines, notes = summarize({"vid": 2609103, "loo_ddp": {"overlap_requested": False,
                                                           "overlap_active": False, "timing": timing}})
    assert "Shown 25.00/s (83.3% of complete)." in lines[1], lines[1]
    assert any("Receive jitter" in n and "20% after more than 50 ms" in n for n in notes), notes
    assert any("45 of 50" in n and "serialized output" in n for n in notes), notes
    assert any("Paint copy averages 5.5 ms" in n for n in notes), notes
    assert any("20.0% of transmission intervals" in n for n in notes), notes
    assert not any("checks late" in n for n in notes), notes
    del timing["loop"]
    try:
        summarize({"loo_ddp": {"overlap_requested": False, "overlap_active": False, "timing": timing}})
        raise AssertionError("An incomplete timing block was accepted.")
    except ValueError as error:
        assert "Missing: timing.loop" in str(error), error
    print("report.py self-test passed.")


def main(arguments):
    if arguments == ["--self-test"]:
        self_test()
        return
    if not arguments:
        raise SystemExit("usage: report.py INFO.json [INFO.json ...] | --self-test")
    for path in arguments:
        info = json.loads(Path(path).read_text())
        lines, notes = summarize(info)
        print(f"== {path}")
        print("\n".join(lines))
        for note in notes:
            print(f"- {note}")
        print()


if __name__ == "__main__":
    main(sys.argv[1:])
