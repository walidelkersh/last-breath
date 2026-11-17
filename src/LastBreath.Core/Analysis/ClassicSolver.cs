namespace LastBreath.Core.Analysis;

// State (n, o): crates on the board and breaths left. With e = 15 − n empty cells the spin lands
// k ~ Binomial(e, p) crates; k = 0 goes to (n, o − 1), anything else to (n + k, refill).
public static class ClassicSolver
{
    public static Solution Solve(GameConfig config, DiveConfig dive)
    {
        var (final, spins) = Table(dive);
        var start = dive.StartingClock;
        var root = Enumerable.Range(0, Board.Size + 1).Select(m => final[0, start, m]).ToArray();
        return new Solution(config, dive, root, spins[0, start]);
    }

    // final[n, o, m] is P(N = m) from state (n, o), and spins[n, o] the expected number of spins left.
    internal static (double[,,] Final, double[,] Spins) Table(DiveConfig dive)
    {
        var refill = dive.RefillTo
            ?? throw new ArgumentException("a classic dive needs a refill value", nameof(dive));
        var p = dive.Chance(Outcome.Crate);
        var top = Math.Max(dive.StartingClock, refill);
        var final = new double[Board.Size, top + 1, Board.Size + 1];
        var spins = new double[Board.Size, top + 1];

        for (var n = Board.Size - 1; n >= 0; n--)
        {
            var landed = Binomial.Pmf(Board.Size - n, p);
            for (var o = 1; o <= top; o++)
            {
                spins[n, o] = 1;
                for (var k = 0; k < landed.Length; k++)
                {
                    var next = n + k;
                    var clock = k == 0 ? o - 1 : refill;
                    if (next == Board.Size || clock == 0)
                    {
                        final[n, o, next] += landed[k];
                        continue;
                    }
                    for (var m = 0; m <= Board.Size; m++)
                        final[n, o, m] += landed[k] * final[next, clock, m];
                    spins[n, o] += landed[k] * spins[next, clock];
                }
            }
        }

        return (final, spins);
    }
}
