namespace LastBreath.Core.Analysis;

public static class DriftSolver
{
    // Each cell is occupied after S spins with probability q = 1 − (1 − p)^S, independently of the
    // others, so N ~ Binomial(15, q). A full board only shortens the round: the round goes past
    // spin s exactly when the board is not full after s spins.
    public static Solution Solve(GameConfig config, DiveConfig dive)
    {
        var p = dive.Chance(Outcome.Crate);
        var spins = dive.StartingClock;
        var meanSpins = Enumerable.Range(0, spins).Sum(s => 1 - Math.Pow(1 - Math.Pow(1 - p, s), Board.Size));
        return new Solution(config, dive, Binomial.Pmf(Board.Size, 1 - Math.Pow(1 - p, spins)), meanSpins);
    }

    // The same answer by backward induction over (n, s), s the spins left, as a check on the closed form.
    public static Solution SolveByInduction(GameConfig config, DiveConfig dive)
    {
        var p = dive.Chance(Outcome.Crate);
        var top = dive.StartingClock;
        var final = new double[Board.Size, top + 1, Board.Size + 1];
        var spins = new double[Board.Size, top + 1];

        for (var n = Board.Size - 1; n >= 0; n--)
        {
            var landed = Binomial.Pmf(Board.Size - n, p);
            for (var s = 1; s <= top; s++)
            {
                spins[n, s] = 1;
                for (var k = 0; k < landed.Length; k++)
                {
                    var next = n + k;
                    if (next == Board.Size || s == 1)
                    {
                        final[n, s, next] += landed[k];
                        continue;
                    }
                    for (var m = 0; m <= Board.Size; m++)
                        final[n, s, m] += landed[k] * final[next, s - 1, m];
                    spins[n, s] += landed[k] * spins[next, s - 1];
                }
            }
        }

        var root = Enumerable.Range(0, Board.Size + 1).Select(m => final[0, top, m]).ToArray();
        return new Solution(config, dive, root, spins[0, top]);
    }
}
