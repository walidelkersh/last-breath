namespace LastBreath.Core.Analysis;

// State (n, o, k): crates on the board, breaths left and tanks used. A spin folds the empty cells one
// at a time over (crates c, tanks used, breaths added a); by exchangeability the fold order does not
// matter. Every move raises k or n or lowers o, so one pass in the order k descending, n descending,
// o ascending reaches every successor before the state that needs it.
public static class TankSolver
{
    public static Solution Solve(GameConfig config, DiveConfig dive) => Solve(config, dive, null);

    // refillTo turns the clock into Classic's (any crate refills it), which no Tank config can ask for.
    // It exists so a test can check that Tank with no tanks and a refill solves to the same as Classic.
    internal static Solution Solve(GameConfig config, DiveConfig dive, int? refillTo)
    {
        var limit = dive.TankLimit
            ?? throw new ArgumentException("a tank dive needs a tank limit", nameof(dive));
        var crate = dive.Chance(Outcome.Crate);
        var tanks = dive.Landing
            .Where(entry => entry.Outcome.IsTank())
            .Select(entry => (Breaths: entry.Outcome.Breaths(), Chance: dive.Chance(entry.Outcome)))
            .ToArray();
        var tankChance = tanks.Sum(tank => tank.Chance);
        var empty = (double)(GameConfig.LandingDenominator - dive.Landing.Sum(entry => entry.Numerator)) / GameConfig.LandingDenominator;
        var mostPerTank = tanks.Select(tank => tank.Breaths).DefaultIfEmpty(0).Max();
        var mostAdded = mostPerTank * limit;
        var start = Math.Max(dive.StartingClock, refillTo ?? 0);

        // With k tanks used the clock is at most start + mostPerTank × k, which bounds o.
        var final = new double[Board.Size, start + mostAdded + 1, limit + 1, Board.Size + 1];
        var spins = new double[Board.Size, start + mostAdded + 1, limit + 1];

        for (var k = limit; k >= 0; k--)
        {
            for (var n = Board.Size - 1; n >= 0; n--)
            {
                var spin = Spin(Board.Size - n, k);
                for (var o = 1; o <= start + mostPerTank * k; o++)
                {
                    spins[n, o, k] = 1;
                    for (var c = 0; c <= Board.Size - n; c++)
                    for (var used = k; used <= limit; used++)
                    for (var a = 0; a <= mostAdded; a++)
                    {
                        var chance = spin[c, used, a];
                        if (chance == 0) continue;
                        var next = n + c;
                        var clock = refillTo is int refill && c > 0 ? refill : o - 1 + a;
                        if (next == Board.Size || clock == 0)
                        {
                            final[n, o, k, next] += chance;
                            continue;
                        }
                        for (var m = 0; m <= Board.Size; m++)
                            final[n, o, k, m] += chance * final[next, clock, used, m];
                        spins[n, o, k] += chance * spins[next, clock, used];
                    }
                }
            }
        }

        var root = Enumerable.Range(0, Board.Size + 1).Select(m => final[0, dive.StartingClock, 0, m]).ToArray();
        return new Solution(config, dive, root, spins[0, dive.StartingClock, 0]);

        // A tank drawn once the limit is reached becomes Empty, as in the landing draw.
        double[,,] Spin(int cells, int used)
        {
            var spin = new double[cells + 1, limit + 1, mostAdded + 1];
            spin[0, used, 0] = 1;
            for (var cell = 0; cell < cells; cell++)
            {
                var next = new double[cells + 1, limit + 1, mostAdded + 1];
                for (var c = 0; c <= cell; c++)
                for (var k = used; k <= limit; k++)
                for (var a = 0; a <= mostAdded; a++)
                {
                    var chance = spin[c, k, a];
                    if (chance == 0) continue;
                    next[c + 1, k, a] += chance * crate;
                    if (k == limit)
                    {
                        next[c, k, a] += chance * (empty + tankChance);
                        continue;
                    }
                    next[c, k, a] += chance * empty;
                    foreach (var (breaths, chanceOfTank) in tanks)
                        next[c, k + 1, a + breaths] += chance * chanceOfTank;
                }
                spin = next;
            }
            return spin;
        }
    }
}
