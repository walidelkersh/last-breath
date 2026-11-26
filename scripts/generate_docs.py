"""Writes the documents that quote the game's figures.

Each file in scripts/templates is prose with {{name}} placeholders. A name stands for a figure or a
table taken from config/dives.json, reports/solve-*.json, reports/simulate-*.json or
reports/pool/*/PoolReport.txt. A name that does not exist stops the script, so no figure in a
document is typed by hand. Edit the prose in the template, never in the written file.

    python -I scripts/generate_docs.py           write the documents
    python -I scripts/generate_docs.py --check   exit 1 if a document differs from what would be written
"""
import argparse
import json
import math
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CELLS = 15
DIVES = [("classic", "Classic"), ("drift", "Static"), ("tank", "Tank")]
DOCS = {
    "math.md": "docs/math.md",
    "game-design.md": "docs/game-design.md",
    "par-sheet.md": "docs/par-sheet.md",
}
TARGET_RTP = 0.96


def read_json(path):
    lines = path.read_text(encoding="utf-8").splitlines()
    return json.loads("\n".join(line for line in lines if not line.lstrip().startswith("//")))


def read_pool(path):
    """The numbers in the first lines of a pool report, which has no JSON form."""
    text = path.read_text(encoding="utf-8")
    patterns = {
        "tickets": r"^tickets\s+(\d+)$",
        "seed": r"^seed\s+(\d+)$",
        "valid": r"^valid\s+(\d+) of \d+$",
        "mean": r"^mean TotalWin\s+([\d.]+), standard error [\d.]+, 99% CI ([\d.]+) to ([\d.]+)$",
        "exact": r"^exact mean\s+([\d.]+), inside the interval: (yes|no)$",
    }
    found = {}
    for name, pattern in patterns.items():
        match = re.search(pattern, text, re.MULTILINE)
        if not match:
            sys.exit(f"{path.relative_to(ROOT)}: no line for {name}")
        found[name] = match.groups()
    return found


def percent(x, places):
    return f"{x * 100:.{places}f}%"


def fixed(x, places):
    return f"{x:.{places}f}"


def whole(x):
    return f"{round(x):,}"


def signed(z):
    text = f"{z:+.2f}"
    return "0.00" if float(text) == 0 else text


def power_of_ten(x):
    mantissa, exponent = f"{x:.1e}".split("e")
    return f"${mantissa} \times 10^{{{int(exponent)}}}$"


def face(units):
    return f"{units / 1000:,g}x"


def table(headers, rows, left=1):
    """A Markdown table whose first `left` columns are left aligned and the rest right aligned."""
    rule = ["---" if i < left else "---:" for i in range(len(headers))]
    lines = [headers, rule, *rows]
    return "\n".join("| " + " | ".join(line) + " |" for line in lines)


def agree(what, written, recomputed):
    if abs(written - recomputed) > 1e-12:
        sys.exit(f"{what}: the report says {written!r} but the config gives {recomputed!r}. Run lab solve --all.")


def coin_units(config):
    jackpots = config["jackpots"]
    return config["cashLadder"] + [jackpots["mini"], jackpots["minor"], jackpots["major"]]


def tier_names(config):
    return [face(units) for units in config["cashLadder"]] + ["Mini", "Minor", "Major"]


def tank_values(spec):
    return [int(entry["outcome"].removeprefix("TankPlus")) for entry in spec["landing"] if entry["outcome"].startswith("TankPlus")]


def or_list(values):
    words = [str(value) for value in values]
    return " or ".join([", ".join(words[:-1]), words[-1]]) if len(words) > 1 else "".join(words)


def load_dive(config, slug, key):
    """Everything the documents say about one dive, with its closed forms checked against the report."""
    spec = config["dives"][key]
    solve = read_json(ROOT / "reports" / f"solve-{key.lower()}.json")
    sim = read_json(ROOT / "reports" / f"simulate-{key.lower()}.json")
    pool = read_pool(ROOT / "reports" / "pool" / key.lower() / "PoolReport.txt")
    numerators = {entry["outcome"]: entry["numerator"] for entry in spec["landing"]}
    p = numerators["Crate"] / 1_000_000
    final = solve["final_crate_probabilities"]
    grand = config["grand"] / 1000

    weights = config["weightTables"][spec["weightTable"]]
    coins = [(units / 1000, weight / 100_000) for units, weight in zip(coin_units(config), weights)]
    mean = sum(value * chance for value, chance in coins)
    agree(f"{slug} coin mean", solve["coin_mean"], mean)
    agree(f"{slug} coin variance", solve["coin_variance"], sum(chance * (value - mean) ** 2 for value, chance in coins))

    clock = spec["startingClock"]
    limit = spec.get("tankLimit", 0)
    most = max(tank_values(spec), default=0)
    if slug == "classic":
        agree("Classic P(N=0) as (1 - p)^45", final[0], (1 - p) ** (CELLS * clock))
        states = CELLS * max(clock, spec["refillTo"])
    elif slug == "drift":
        q = 1 - (1 - p) ** clock
        agree("Drift mean crates as 15q", solve["mean_crates"], CELLS * q)
        for crates, chance in enumerate(final):
            agree(f"Drift P(N={crates}) as a binomial", chance, math.comb(CELLS, crates) * q**crates * (1 - q) ** (CELLS - crates))
        states = CELLS * clock
    else:
        states = CELLS * sum(clock + most * used for used in range(limit + 1))

    e2 = solve["e_a2"]
    seen = sim["final_crate_counts"][CELLS]
    expected = solve["grand_probability"] * sim["rounds"]
    mean_award = sim["mean_award"]
    low, high = pool["mean"][1:]

    facts = {
        "name": spec["name"],
        "numerator": f"{numerators['Crate']:,}",
        "p": f"{p:g}",
        "clock": str(clock),
        "refill": str(spec.get("refillTo", "")),
        "tank_limit": str(limit),
        "tank_breaths": or_list(tank_values(spec)),
        "breath_ceiling": str(clock + most * limit),
        "states": str(states),
        "mu": fixed(solve["coin_mean"], 4),
        "var": fixed(solve["coin_variance"], 4),
        "rtp": percent(solve["rtp"], 4),
        "rtp_long": percent(solve["rtp"], 6),
        "gap": fixed(abs(solve["rtp"] - TARGET_RTP) * 100, 4),
        "sd": fixed(solve["sd"], 2),
        "sd_long": fixed(solve["sd"], 4),
        "e2": fixed(e2, 4),
        "hit": percent(solve["hit_frequency"], 2),
        "hit_long": percent(solve["hit_frequency"], 4),
        "nothing": percent(final[0], 2),
        "spins": fixed(solve["mean_spins"], 2),
        "spins_long": fixed(solve["mean_spins"], 6),
        "spins_short": power_of_ten(clock - solve["mean_spins"]),
        "crates": fixed(solve["mean_crates"], 2),
        "crates_long": fixed(solve["mean_crates"], 4),
        "grand_odds": whole(1 / solve["grand_probability"]),
        "grand_p": f"{solve['grand_probability']:.4e}",
        "grand_share_rtp": percent(grand * solve["grand_probability"] / solve["rtp"], 1),
        "grand_share_e2": percent(grand * grand * solve["grand_probability"] / e2, 1),
        "max": whole(solve["reachable_max"]),
        "rounds": whole(sim["rounds"]),
        "seed": str(sim["seed"]),
        "sim_rtp": percent(mean_award["simulated"], 4),
        "sim_dist": f"{abs(mean_award['z']):.2f}",
        "sim_low": percent(mean_award["low99"], 4),
        "sim_high": percent(mean_award["high99"], 4),
        "sim_sd": fixed(sim["award_sd"], 4),
        "chi_crates": fixed(sim["final_crates"]["statistic"], 2),
        "chi_crates_limit": fixed(sim["final_crates"]["limit"], 2),
        "chi_crates_df": str(sim["final_crates"]["freedom"]),
        "buckets": str(len(sim["award_buckets"])),
        "chi_award": fixed(sim["award"]["statistic"], 2),
        "chi_award_limit": fixed(sim["award"]["limit"], 2),
        "chi_award_df": str(sim["award"]["freedom"]),
        "grands_seen": str(seen),
        "grands_expected": fixed(expected, 1),
        "tickets_checked": whole(sim["tickets_checked"]),
        "tickets_invalid": str(sim["tickets_invalid"]),
        "pool_tickets": whole(int(pool["tickets"][0])),
        "pool_seed": pool["seed"][0],
        "pool_valid": whole(int(pool["valid"][0])),
        "pool_mean": pool["mean"][0],
        "pool_low": low,
        "pool_high": high,
        "pool_exact": pool["exact"][0],
        "pool_inside": pool["exact"][1],
    }
    return solve, sim, spec, facts


def checks_table(sim):
    measures = [
        ("Mean award, as RTP", "mean_award", lambda x: percent(x, 4)),
        ("Hit frequency", "hit_frequency", lambda x: percent(x, 4)),
        ("Mean spins", "mean_spins", lambda x: fixed(x, 6)),
    ]
    rows = [[label, show(sim[key]["exact"]), show(sim[key]["simulated"]), signed(sim[key]["z"])] for label, key, show in measures]
    return table(["Measure", "Exact", "Simulated", "Difference in standard errors"], rows)


def build(config):
    """Every name a template may use, mapped to the text that replaces it."""
    names = {"version": config["version"], "cells": str(CELLS), "grand": f"{config['grand'] // 1000:,}",
             "cap": f"{config['cap'] // 1000:,}", "bets": ", ".join(f"{bet:.2f}" for bet in config["bets"]),
             "smallest_coin": face(config["cashLadder"][0])}
    solves, sims, specs = {}, {}, {}
    hashes = set()
    for slug, key in DIVES:
        solves[slug], sims[slug], specs[slug], facts = load_dive(config, slug, key)
        names.update({f"{slug}.{name}": value for name, value in facts.items()})
        hashes |= {solves[slug]["config_hash"], sims[slug]["config_hash"]}
    if len(hashes) != 1:
        sys.exit("the solve and simulate reports come from different configs. Run scripts/reproduce.sh.")
    names["hash"] = hashes.pop()
    for name in ("rounds", "seed", "pool_tickets", "pool_seed"):
        values = {names[f"{slug}.{name}"] for slug, _ in DIVES}
        if len(values) != 1:
            sys.exit(f"the dives do not share one {name}: {sorted(values)}")
        names[name] = values.pop()

    names["coins"] = coin_table(config)
    names["ladder"] = ladder_table(config)
    names["summary"] = summary_table(solves, sims, specs)
    for slug, key in DIVES:
        names[f"figures.{slug}"] = figures_table(names, slug)
        names[f"distribution.{slug}"] = distribution_table(solves[slug])
        names[f"landing.{slug}"] = landing_table(specs[slug])
        names[f"weights.{slug}"] = weight_table(config, specs[slug])
        names[f"checks.{slug}"] = checks_table(sims[slug])
    return names


def coin_table(config):
    tables = list(config["weightTables"])
    rows = [[name, *(f"{config['weightTables'][t][tier]:,}" for t in tables)] for tier, name in enumerate(tier_names(config))]
    return table(["Coin", *(t.capitalize() for t in tables)], rows)


def ladder_table(config):
    units = coin_units(config) + [config["grand"]]
    kinds = ["Cash crate"] * len(config["cashLadder"]) + ["Mini jackpot", "Minor jackpot", "Major jackpot", "Grand"]
    return table(["Coin or prize", "Value, in bets", "Value, in units"], [[kind, face(u), f"{u:,}"] for kind, u in zip(kinds, units)])


def summary_table(solves, sims, specs):
    columns = [slug for slug, _ in DIVES]
    rows = [
        ("RTP, exact", lambda s, m: percent(s["rtp"], 4)),
        ("Standard deviation of a round, in bets", lambda s, m: fixed(s["sd"], 2)),
        ("Hit frequency", lambda s, m: percent(s["hit_frequency"], 2)),
        ("Mean spins", lambda s, m: fixed(s["mean_spins"], 2)),
        ("Mean crates on the final board", lambda s, m: fixed(s["mean_crates"], 2)),
        ("Grand, 1 in", lambda s, m: whole(1 / s["grand_probability"])),
        ("Reachable maximum, in bets", lambda s, m: whole(s["reachable_max"])),
        (f"RTP, simulated, {whole(sims['classic']['rounds'])} rounds, seed {sims['classic']['seed']}", lambda s, m: percent(m["mean_award"]["simulated"], 4)),
    ]
    return table(["", *(specs[slug]["name"] for slug in columns)], [[label, *(show(solves[c], sims[c]) for c in columns)] for label, show in rows])


def figures_table(names, slug):
    rows = [
        ("RTP", "rtp_long"), ("Distance from 96%, in percentage points", "gap"),
        ("Standard deviation of a round, in bets", "sd_long"), ("Second moment of the award, $E[A^2]$", "e2"),
        ("Hit frequency", "hit_long"), ("Chance a round pays nothing", "nothing"),
        ("Mean spins", "spins_long"), ("Mean crates on the final board", "crates_long"),
        ("Grand, 1 in", "grand_odds"), ("Grand, share of the RTP", "grand_share_rtp"),
        ("Reachable maximum, in bets", "max"), ("Coin mean, in bets", "mu"), ("Coin variance", "var"),
    ]
    return table(["Figure", "Value"], [[label, names[f"{slug}.{key}"]] for label, key in rows])


def distribution_table(solve):
    final = solve["final_crate_probabilities"]
    half = len(final) // 2
    rows = [[str(low), f"{final[low]:.8f}", str(low + half), f"{final[low + half]:.8f}"] for low in range(half)]
    return table(["Crates", "Probability", "Crates", "Probability"], rows, left=0)


def landing_table(spec):
    entries = [(entry["outcome"], entry["numerator"]) for entry in spec["landing"]]
    entries.append(("Empty", 1_000_000 - sum(n for _, n in entries)))
    labels = {"Crate": "Crate", "Empty": "Nothing", **{f"TankPlus{j}": f"Air tank +{j}" for j in (1, 2, 3)}}
    return table(["Outcome of an empty cell", "Numerator, out of 1,000,000", "Chance"],
                 [[labels[outcome], f"{n:,}", percent(n / 1_000_000, 4)] for outcome, n in entries])


def weight_table(config, spec):
    weights = config["weightTables"][spec["weightTable"]]
    rows = [[name, face(units), f"{units:,}", f"{weight:,}", percent(weight / 100_000, 3)]
            for name, units, weight in zip(tier_names(config), coin_units(config), weights)]
    return table(["Coin", "Value, in bets", "Value, in units", "Weight, out of 100,000", "Chance"], rows)


def render(template, names, source):
    def fill(match):
        if match.group(1) not in names:
            sys.exit(f"{source}: the name {match.group(1)!r} is not a figure or table")
        return names[match.group(1)]

    return re.sub(r"\{\{([a-z0-9_.]+)\}\}", fill, template)


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    names = build(read_json(ROOT / "config" / "dives.json"))

    stale = []
    for template_name, output in DOCS.items():
        source = f"scripts/templates/{template_name}"
        first, rest = (ROOT / source).read_text(encoding="utf-8").split("\n", 1)
        mark = f"<!-- Generated by scripts/generate_docs.py from {source}. Edit the template. -->"
        text = render(f"{first}\n{mark}\n{rest}", names, source)
        path = ROOT / output
        if args.check:
            if not path.exists() or path.read_text(encoding="utf-8") != text:
                stale.append(output)
        else:
            path.write_text(text, encoding="utf-8", newline="\n")
            print(f"wrote {output}")
    if stale:
        print("out of date: " + ", ".join(stale) + ". Run python -I scripts/generate_docs.py")
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
