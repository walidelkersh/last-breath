using System.Text.Json;
using LastBreath.Core.Dives;

namespace LastBreath.Core.Analysis;

// Everything a run measured against the exact solve. Money is a multiple of the bet. Nothing here
// depends on the clock or the machine, so one seed gives the same report every time.
public sealed record SimulationReport(
    string Dive,
    long Rounds,
    ulong Seed,
    string ConfigHash,
    Measure MeanAward,
    Measure MeanAwardByBatches,
    Measure HitFrequency,
    Measure MeanSpins,
    double AwardSd,
    double ExactAwardSd,
    double SpinVariance,
    ChiSquare FinalCrates,
    long[] FinalCrateCounts,
    ChiSquare Award,
    AwardBucket[] AwardBuckets)
{
    private static readonly JsonSerializerOptions Json = new()
    {
        WriteIndented = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public bool Passed =>
        MeanAward.WithinThreeSe && MeanAwardByBatches.WithinThreeSe && HitFrequency.WithinThreeSe
        && MeanSpins.WithinThreeSe && FinalCrates.Passed && Award.Passed;

    public string ToJson() => JsonSerializer.Serialize(this, Json) + "\n";
}

public static class Simulator
{
    public const int Batches = 100;

    public const long MinimumRounds = 1_000;

    // One PCG32 stream plays every round back to back, as the client does. The exact solve is passed in
    // so a test can hand over a wrong one and see the checks fail.
    public static SimulationReport Run(string id, GameConfig config, Solution exact, long rounds, ulong seed)
    {
        ArgumentOutOfRangeException.ThrowIfLessThan(rounds, MinimumRounds);

        var dive = config.Dives[id];
        var play = Engines.For(id);
        var random = new Pcg32Random(seed);
        var tally = new Tally(config.Cap / ConfigLoader.UnitStep + 1);
        var batchMeans = new double[Batches];
        for (var batch = 0; batch < Batches; batch++)
        {
            var size = rounds / Batches + (batch < rounds % Batches ? 1 : 0);
            var before = tally.AwardUnits;
            for (var round = 0L; round < size; round++)
            {
                var played = play(config, dive, random);
                tally.Add(played.Award, played.Board.Occupied, played.Turns.Count);
            }
            batchMeans[batch] = (double)(tally.AwardUnits - before) / size / 1000;
        }

        var average = batchMeans.Average();
        var batchError = Math.Sqrt(batchMeans.Sum(mean => (mean - average) * (mean - average)) / (Batches - 1) / Batches);
        var buckets = tally.AwardBucketsAgainst(exact);
        var meanAward = tally.MeanAwardAgainst(exact);

        return new SimulationReport(
            id.ToLowerInvariant(),
            rounds,
            seed,
            config.Hash(),
            meanAward,
            meanAward with { StandardError = batchError, Critical = Measure.StudentT99 },
            tally.HitFrequencyAgainst(exact),
            tally.MeanSpinsAgainst(exact),
            Math.Sqrt(tally.AwardVariance),
            exact.Sd,
            tally.SpinVariance,
            tally.CratesAgainst(exact),
            tally.Crates,
            ChiSquare.Of(buckets),
            buckets);
    }
}
