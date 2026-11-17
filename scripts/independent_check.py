"""Independent exact check of the Classic, Drift and Tank dives.

It reads config/dives.json and works out, from the game rules alone and in exact fractions,
each dive's RTP, E[A^2], hit frequency, final crate count distribution, mean spins and Grand
probability. Probability mass is pushed forward one spin at a time from the empty board until
every round has ended, and the number of crates and tanks that land in a spin comes from a
multinomial count over the empty cells. A few results are then worked out a second way and
must agree exactly.

If reports/solve-<dive>.json exists, each of its values must match to 1e-12, or the script
exits non-zero.

    python -I scripts/independent_check.py --dives classic,static,tank
    python -I scripts/independent_check.py --self-test
"""
import argparse
import json
import math
import sys
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CELLS = 15
TOLERANCE = Fraction(1, 10**12)
REPORT_KEYS = ["rtp", "e_a2", "hit_frequency", "mean_spins", "grand_probability"]


def load_config():
    text = (ROOT / "config" / "dives.json").read_text(encoding="utf-8")
    return json.loads("\n".join(line for line in text.splitlines() if not line.lstrip().startswith("//")))


class Dive:
    def __init__(self, config, key):
        spec = config["dives"][key]
        self.key = key
        weights = config["weightTables"][spec["weightTable"]]
        jackpots = config["jackpots"]
        units = config["cashLadder"] + [jackpots["mini"], jackpots["minor"], jackpots["major"]]
        coins = [(Fraction(v, 1000), Fraction(w, 100_000)) for v, w in zip(units, weights)]
        self.mu = sum(v * w for v, w in coins)
        self.coin_m2 = sum(v * v * w for v, w in coins)
        self.grand = Fraction(config["grand"], 1000)
        self.max_units = CELLS * max(v for v, w in zip(units, weights) if w > 0) + config["grand"]
        self.cap_units = config["cap"]
        self.clock = spec["startingClock"]
        self.refill = spec.get("refillTo")
        self.tank_limit = spec.get("tankLimit", 0)
        landing = {e["outcome"]: Fraction(e["numerator"], 1_000_000) for e in spec["landing"]}
        self.p_crate = landing.pop("Crate")
        self.tanks = {int(name.removeprefix("TankPlus")): p for name, p in landing.items()}
        self.p_tank = sum(self.tanks.values(), Fraction(0))
        self.p_empty = 1 - self.p_crate - self.p_tank
        self._landing = {}

    def breaths(self, r):
        """Law of the breaths added by r tanks whose types are i.i.d. given that they are tanks."""
        law = {0: Fraction(1)}
        for _ in range(r):
            step = {}
            for a, pa in law.items():
                for value, p in self.tanks.items():
                    step[a + value] = step.get(a + value, 0) + pa * p / self.p_tank
            law = step
        return law

    def landing(self, empty, tanks_used):
        """{(crates, breaths added, tanks counted): probability} for one spin."""
        cached = self._landing.get((empty, tanks_used))
        if cached is not None:
            return cached
        room = self.tank_limit - tanks_used
        law = {}
        for c in range(empty + 1):
            for t in range(empty - c + 1):
                p = (math.comb(empty, c) * math.comb(empty - c, t)
                     * self.p_crate**c * self.p_tank**t * self.p_empty**(empty - c - t))
                if p == 0:
                    continue
                # Tank types are i.i.d. and independent of position, so the first r tanks in
                # cell order are r i.i.d. draws; the rest turn to Empty and change nothing.
                r = min(t, room)
                for a, pa in self.breaths(r).items():
                    law[(c, a, r)] = law.get((c, a, r), 0) + p * pa
        self._landing[(empty, tanks_used)] = law
        return law


def propagate(dive, start=None):
    """Push mass forward from the start state to absorption.

    Each live state (crates, clock, tanks used) carries its mass and the mass-weighted first and
    second moments of the board total, in multiples of the bet.
    """
    live = {start or (0, dive.clock, 0): (Fraction(1), Fraction(0), Fraction(0))}
    final = [Fraction(0)] * (CELLS + 1)
    spins = ea = ea2 = Fraction(0)
    mu, g = dive.mu, dive.grand
    while live:
        ahead = {}
        for (n, o, k), (mass, s1, s2) in live.items():
            spins += mass
            for (c, a, r), w in dive.landing(CELLS - n, k).items():
                x1 = c * mu
                x2 = c * dive.coin_m2 + c * (c - 1) * mu * mu
                q, t1, t2 = w * mass, w * (s1 + mass * x1), w * (s2 + 2 * s1 * x1 + mass * x2)
                n2, k2 = n + c, k + r
                o2 = dive.refill if dive.refill and c else o - 1 + a
                if n2 == CELLS or o2 == 0:
                    final[n2] += q
                    ea += t1
                    ea2 += t2
                    if n2 == CELLS:
                        ea += g * q
                        ea2 += 2 * g * t1 + g * g * q
                else:
                    m, f1, f2 = ahead.get((n2, o2, k2), (0, 0, 0))
                    ahead[(n2, o2, k2)] = (m + q, f1 + t1, f2 + t2)
        live = ahead
    return {
        "rtp": ea,
        "e_a2": ea2,
        "hit_frequency": 1 - final[0],
        "mean_spins": spins,
        "grand_probability": final[CELLS],
        "final_crate_probabilities": final,
    }


def by_crate_count(dive, final):
    """E[A] and E[A^2] from the final crate count alone, using i.i.d. coin values."""
    var = dive.coin_m2 - dive.mu**2
    en = sum(m * p for m, p in enumerate(final))
    en2 = sum(m * m * p for m, p in enumerate(final))
    pg, g = final[CELLS], dive.grand
    return (dive.mu * en + g * pg,
            en * var + dive.mu**2 * en2 + 2 * g * dive.mu * CELLS * pg + g * g * pg)


def binomial(n, q):
    return [math.comb(n, m) * q**m * (1 - q)**(n - m) for m in range(n + 1)]


def cross_checks(dive, values):
    """Second routes to the same numbers. Returns (name, agrees) pairs."""
    rtp, ea2 = by_crate_count(dive, values["final_crate_probabilities"])
    checks = [(f"{dive.key} rtp from the crate count law", rtp == values["rtp"]),
              (f"{dive.key} e_a2 from the crate count law", ea2 == values["e_a2"])]
    if dive.key == "Static":
        p = dive.p_crate
        q = 1 - (1 - p)**dive.clock
        checks.append(("Static crate count is Binomial(15, 1 - (1 - p)^6)",
                       binomial(CELLS, q) == values["final_crate_probabilities"]))
        spins = sum(1 - (1 - (1 - p)**t)**CELLS for t in range(dive.clock))
        checks.append(("Static mean spins as the sum of P(not full after t spins)",
                       spins == values["mean_spins"]))
    return checks


def decimal(x, places=12):
    sign = "-" if x < 0 else ""
    scaled = round(abs(x) * 10**places)
    return f"{sign}{scaled // 10**places}.{scaled % 10**places:0{places}d}"


def print_values(dive, values, exact):
    print(f"\n{dive.key}")
    rows = [(key, values[key]) for key in REPORT_KEYS]
    rows.insert(2, ("sd", None))
    rows += [(f"P(N={m})", p) for m, p in enumerate(values["final_crate_probabilities"])]
    for name, x in rows:
        if name == "sd":
            print(f"  {name:<20} {math.sqrt(values['e_a2'] - values['rtp']**2):.12f}")
            continue
        print(f"  {name:<20} {decimal(x)}" + (f"  {x}" if exact else ""))
    print(f"  {'reachable max':<20} {dive.max_units / 1000:g}x bet, cap {dive.cap_units / 1000:g}x")


def compare(dive, name, values):
    path = ROOT / "reports" / f"solve-{name}.json"
    if not path.exists():
        print(f"  {path.relative_to(ROOT).as_posix()} not found, nothing to compare yet")
        return []
    report = json.loads(path.read_text(encoding="utf-8"))
    failures = []
    for key in REPORT_KEYS:
        if abs(Fraction(report[key]) - values[key]) > TOLERANCE:
            failures.append(f"{name}: {key} is {report[key]!r} in the report, {decimal(values[key])} here")
    reported = report["final_crate_probabilities"]
    if len(reported) != CELLS + 1:
        failures.append(f"{name}: final_crate_probabilities has {len(reported)} entries, not 16")
    else:
        for m, (theirs, mine) in enumerate(zip(reported, values["final_crate_probabilities"])):
            if abs(Fraction(theirs) - mine) > TOLERANCE:
                failures.append(f"{name}: final_crate_probabilities[{m}] is {theirs!r} in the report, {decimal(mine)} here")
    sd = math.sqrt(values["e_a2"] - values["rtp"]**2)
    print(f"  report sd {report.get('sd')!r}, here {sd:.12f}")
    print(f"  {path.relative_to(ROOT).as_posix()}: " + ("matches" if not failures else f"{len(failures)} differences"))
    return failures


def self_test(config):
    failures = []

    def check(name, ok):
        print(f"  {'ok  ' if ok else 'FAIL'} {name}")
        if not ok:
            failures.append(name)

    for table, weights in config["weightTables"].items():
        check(f"weight table {table} sums to 100,000", sum(weights) == 100_000)

    classic = Dive(config, "Classic")
    p, miss = classic.p_crate, 1 - classic.p_crate
    one_cell = propagate(classic, start=(CELLS - 1, 3, 0))
    full = 1 - miss**3
    check("Classic, one empty cell, 3 breaths: P(full) = 1 - (1 - p)^3",
          one_cell["grand_probability"] == full)
    check("Classic, one empty cell: P(stay at 14) = (1 - p)^3",
          one_cell["final_crate_probabilities"][CELLS - 1] == miss**3)
    check("Classic, one empty cell: mean spins = 1 + (1 - p) + (1 - p)^2",
          one_cell["mean_spins"] == 1 + miss + miss**2)
    # The start state carries a board total of 0, so only what is added from there is counted.
    check("Classic, one empty cell: expected award added = P(full) (mu + Grand)",
          one_cell["rtp"] == full * (classic.mu + classic.grand))
    last_breath = propagate(classic, start=(CELLS - 1, 1, 0))
    check("Classic, one empty cell, last breath: P(full) = p", last_breath["grand_probability"] == p)

    drift = Dive(config, "Static")
    q = 1 - (1 - drift.p_crate)**6
    values = propagate(drift)
    expected = sum(m * x for m, x in enumerate(values["final_crate_probabilities"])) / CELLS
    check("Drift: each cell is filled with probability 1 - (1 - p)^6", expected == q)
    check("Drift: final crate count is Binomial(15, q)",
          values["final_crate_probabilities"] == binomial(CELLS, q))

    tank = Dive(config, "Tank")
    check("Tank, one empty cell: a +2 tank adds 2 breaths with probability p(+2)",
          tank.landing(1, 0).get((0, 2, 1)) == tank.tanks[2])
    check("Tank, limit reached: no tank adds breaths",
          all(a == 0 for (_, a, _) in tank.landing(CELLS, tank.tank_limit)))
    one_left = tank.landing(3, tank.tank_limit - 1)
    no_crate = (tank.p_tank + tank.p_empty)**3 - tank.p_empty**3
    check("Tank, one tank left, three empty cells, no crate: +1 from the first tank only",
          one_left.get((0, 1, 1)) == no_crate * tank.tanks[1] / tank.p_tank)
    check("Tank, landing law sums to 1 for every empty count",
          all(sum(tank.landing(e, k).values()) == 1 for e in range(CELLS + 1) for k in range(4)))
    return failures


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dives", default="classic,static,tank")
    parser.add_argument("--self-test", action="store_true")
    parser.add_argument("--exact", action="store_true", help="also print each value as a fraction")
    args = parser.parse_args()
    config = load_config()

    if args.self_test:
        failures = self_test(config)
        print(f"self-test: {len(failures)} failures")
        return 1 if failures else 0

    keys = {key.lower(): key for key in config["dives"]}
    failures, agreed, routes = [], 0, 0
    for name in args.dives.split(","):
        if name not in keys:
            print(f"unknown dive {name!r}, expected one of {', '.join(keys)}")
            return 2
        dive = Dive(config, keys[name])
        assert dive.max_units < dive.cap_units, f"{name}: reachable maximum reaches the cap"
        values = propagate(dive)
        assert sum(values["final_crate_probabilities"]) == 1, f"{name}: mass lost"
        print_values(dive, values, args.exact)
        for check, ok in cross_checks(dive, values):
            routes += 1
            agreed += ok
            print(f"  {'agrees  ' if ok else 'DIFFERS '} {check}")
            if not ok:
                failures.append(check)
        failures += compare(dive, name, values)

    print(f"\nsecond routes: {agreed} of {routes} agree exactly")
    for failure in failures:
        print(f"FAIL {failure}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
