import { readFileSync } from "node:fs";
import { join } from "node:path";

// The chance of an award, worked out again from the report of a dive and from the config, so that the sentence on the plate can be
// checked against figures that the page did not compute. The award of a round with N filled cells is the sum of N coins, drawn from the
// weight table of the dive, plus the Grand when the board is full. Awards sit on a lattice of 50 units.

const root = join(__dirname, "..", "..", "..");
const step = 50;

const config = JSON.parse(
  readFileSync(join(root, "config", "dives.json"), "utf8")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n"),
);

export function awardDistribution(slug: "classic" | "static" | "tank") {
  const report = JSON.parse(readFileSync(join(root, "reports", `solve-${slug}.json`), "utf8"));
  const finalCrates: number[] = report.final_crate_probabilities;
  const key = slug === "classic" ? "Classic" : slug === "static" ? "Static" : "Tank";
  const weights: number[] = config.weightTables[config.dives[key].weightTable];
  const units = [...config.cashLadder, config.jackpots.mini, config.jackpots.minor, config.jackpots.major];
  const coins = units.map((value, tier) => ({ value, chance: weights[tier] / 100_000 })).filter((coin) => coin.chance > 0);
  const top = Math.max(...coins.map((coin) => coin.value));
  const most = finalCrates.reduce((last, chance, count) => (chance > 0 ? count : last), 0);
  const award = new Array<number>((most * top + (most === 15 ? config.grand : 0)) / step + 1).fill(0);

  let sum = [1];
  for (let count = 0; count <= most; count++) {
    if (count > 0) {
      const next = new Array<number>(sum.length + top / step).fill(0);
      sum.forEach((chance, index) => {
        if (chance === 0) return;
        for (const coin of coins) next[index + coin.value / step] += chance * coin.chance;
      });
      sum = next;
    }
    const shift = count === 15 ? config.grand / step : 0;
    sum.forEach((chance, index) => {
      award[index + shift] += finalCrates[count] * chance;
    });
  }
  return award;
}

const rounded = (every: number) => {
  const scale = every < 10 ? 1 : 10 ** (Math.floor(Math.log10(every)) - 1);
  return (Math.round(every / scale) * scale).toLocaleString("en-US");
};

const times = (units: number) => (units / 1000).toLocaleString("en-US", { maximumFractionDigits: 2 });

// The sentence the plate should carry for a round of this dive that paid this many units at a bet of 1.00.
export function expectedLine(slug: "classic" | "static" | "tank", kind: string, units: number) {
  const award = awardDistribution(slug);
  const atLeast = (from: number) => award.slice(Math.ceil(from / step)).reduce((sum, chance) => sum + chance, 0);
  if (units === 0) {
    const every = 1 / award[0];
    return every < 2
      ? `More than half of all ${kind} dives surface with nothing, and that is part of the 96%.`
      : `About 1 in ${rounded(every)} ${kind} dives surfaces with nothing, and that is part of the 96%.`;
  }
  if (units < 1000) {
    // Every dive that ends under the bet, the ones that pay nothing included.
    const tenths = Math.round((1 - atLeast(1000)) * 10);
    if (tenths >= 10) return `Nearly every ${kind} dive returns less than the bet.`;
    return tenths < 1 ? `Fewer than 1 in 10 ${kind} dives return less than the bet.` : `About ${tenths} in 10 ${kind} dives return less than the bet.`;
  }
  const every = 1 / atLeast(units);
  return every < 2
    ? `A win of ${times(units)}× or more comes in more than half of ${kind} dives.`
    : `A win of ${times(units)}× or more comes in about 1 ${kind} dive in ${rounded(every)}.`;
}
