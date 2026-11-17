using LastBreath.Core;
using LastBreath.Core.Analysis;
using LastBreath.Core.Dives;
using Xunit.Abstractions;

namespace LastBreath.Tests;

// Plays each engine from a fixed seed and checks it against the exact solve. This is a small check
// on the rules the two share; the full simulation is a separate, much longer run.
[Trait("Category", "Analysis")]
public sealed class SolverEngineTests(ITestOutputHelper output)
{
    private const int Rounds = 200_000;

    // Chi-square critical values at the 0.001 level for 1 to 15 degrees of freedom.
    private static readonly double[] ChiSquareCritical =
        [10.828, 13.816, 16.266, 18.467, 20.515, 22.458, 24.322, 26.124, 27.877, 29.588, 31.264, 32.909, 34.528, 36.123, 37.697];

    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    [Theory]
    [InlineData("Classic", 101UL)]
    [InlineData("Static", 202UL)]
    [InlineData("Tank", 303UL)]
    public void EngineAgreesWithTheExactSolve(string id, ulong seed)
    {
        var dive = Default.Dives[id];
        var (solution, play) = id switch
        {
            "Classic" => (ClassicSolver.Solve(Default, dive), (Func<GameConfig, DiveConfig, IRandomSource, Round>)ClassicDive.Play),
            "Static" => (DriftSolver.Solve(Default, dive), DriftDive.Play),
            _ => (TankSolver.Solve(Default, dive), TankDive.Play),
        };

        var random = new Pcg32Random(seed);
        var total = 0.0;
        var hits = 0;
        var crates = new long[Board.Size + 1];
        for (var round = 0; round < Rounds; round++)
        {
            var played = play(Default, dive, random);
            total += played.Award / 1000.0;
            if (played.Award > 0) hits++;
            crates[played.Board.Occupied]++;
        }

        var mean = total / Rounds;
        var meanError = solution.Sd / Math.Sqrt(Rounds);
        var hitFrequency = (double)hits / Rounds;
        var hitError = Math.Sqrt(solution.HitFrequency * (1 - solution.HitFrequency) / Rounds);
        var (chiSquare, freedom) = ChiSquare(crates, solution.FinalCrates);

        output.WriteLine($"{id}: mean {mean:F5} vs {solution.Rtp:F5} ({(mean - solution.Rtp) / meanError:F2} SE), " +
            $"hit {hitFrequency:F5} vs {solution.HitFrequency:F5} ({(hitFrequency - solution.HitFrequency) / hitError:F2} SE), " +
            $"chi-square {chiSquare:F2} on {freedom} df, limit {ChiSquareCritical[freedom - 1]}");

        Assert.InRange(mean, solution.Rtp - 4 * meanError, solution.Rtp + 4 * meanError);
        Assert.InRange(hitFrequency, solution.HitFrequency - 4 * hitError, solution.HitFrequency + 4 * hitError);
        Assert.True(chiSquare < ChiSquareCritical[freedom - 1], $"chi-square {chiSquare} on {freedom} df");
    }

    // Neighbouring counts are pooled until each group expects at least 5 rounds; a short tail joins the last group.
    private static (double ChiSquare, int Freedom) ChiSquare(long[] observed, double[] chances)
    {
        var groups = new List<(double Expected, long Observed)>();
        var expected = 0.0;
        var seen = 0L;
        for (var m = 0; m < chances.Length; m++)
        {
            expected += chances[m] * Rounds;
            seen += observed[m];
            if (expected < 5) continue;
            groups.Add((expected, seen));
            (expected, seen) = (0, 0);
        }
        if (expected > 0 || seen > 0)
            groups[^1] = (groups[^1].Expected + expected, groups[^1].Observed + seen);

        var statistic = groups.Sum(group => Math.Pow(group.Observed - group.Expected, 2) / group.Expected);
        return (statistic, groups.Count - 1);
    }
}
