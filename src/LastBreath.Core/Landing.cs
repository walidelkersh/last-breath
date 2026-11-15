namespace LastBreath.Core;

// For a Bosun, Cell holds its face as cash. The Crew dive decides when it counts as a plain crate.
// For an air tank, Cell is empty and the outcome says how many breaths it adds.
public readonly record struct Landed(int Index, Outcome Outcome, Cell Cell);

public static class Landing
{
    private const int BosunRolls = 100;

    // Draws one spin for every cell that is empty now, in increasing cell index, taking random
    // numbers in the order the rules fix: outcome first, then the tier or face if there is one.
    // tanksUsed is the number of air tanks the round has already landed.
    public static List<Landed> Draw(GameConfig config, DiveConfig dive, Board board, int tanksUsed, IRandomSource random)
    {
        var weights = config.WeightTables[dive.WeightTable];
        var tankLimit = dive.TankLimit ?? 0;
        var landed = new List<Landed>();

        for (var index = 0; index < Board.Size; index++)
        {
            if (!board[index].IsEmpty) continue;

            var outcome = Map(dive.Landing, random.NextInt(GameConfig.LandingDenominator));
            if (outcome == Outcome.Empty) continue;
            if (outcome.IsTank())
            {
                if (tanksUsed >= tankLimit) continue;
                tanksUsed++;
            }

            var cell = outcome switch
            {
                Outcome.Crate => config.Crate(Tier(weights, random.NextInt(GameConfig.WeightTotal))),
                Outcome.Bosun => new Cell(CellKind.Cash, BosunFace(random.NextInt(BosunRolls))),
                Outcome.Captain => new Cell(CellKind.Captain, 0),
                _ => default,
            };
            landed.Add(new Landed(index, outcome, cell));
        }

        return landed;
    }

    private static Outcome Map(LandingEntry[] landing, int roll)
    {
        var threshold = 0;
        foreach (var entry in landing)
        {
            threshold += entry.Numerator;
            if (roll < threshold) return entry.Outcome;
        }
        return Outcome.Empty;
    }

    private static int Tier(int[] weights, int roll)
    {
        var threshold = 0;
        for (var tier = 0; tier < weights.Length; tier++)
        {
            threshold += weights[tier];
            if (roll < threshold) return tier;
        }
        throw new InvalidOperationException("the weights do not add up to the roll range");
    }

    // shortcut: faces and odds are fixed here, move them into the config when the Crew dive needs to tune them.
    private static int BosunFace(int roll) => roll < 60 ? 50 : roll < 90 ? 100 : 250;
}
