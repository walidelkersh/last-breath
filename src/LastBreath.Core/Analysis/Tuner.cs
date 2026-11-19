namespace LastBreath.Core.Analysis;

public sealed record Tuning(int Old, int New, double RtpBefore, double RtpAfter);

// The crate numerator is the one knob: a step of 1 in a million moves the RTP by about 0.005 percentage
// points. The search uses the exact solver and never a simulation.
public static class Tuner
{
    public const double Target = 0.96;

    // Finds the integer numerator whose exact RTP is closest to the target. The result keeps the old
    // numerator unless the new one is strictly closer. Nothing else in the dive changes.
    public static Tuning Tune(string id, GameConfig config)
    {
        var dive = config.Dives[id];
        var crate = Array.FindIndex(dive.Landing, entry => entry.Outcome == Outcome.Crate);
        var old = dive.Landing[crate].Numerator;
        var room = GameConfig.LandingDenominator - dive.Landing.Sum(entry => entry.Numerator) + old;

        double Rtp(int numerator) => Solvers.Solve(id, config, dive with
        {
            Landing = [.. dive.Landing.Select((entry, at) => at == crate ? entry with { Numerator = numerator } : entry)],
        }).Rtp;

        if (Rtp(room) < Target)
            throw new InvalidOperationException($"no crate numerator takes {id} to the target RTP");

        // The RTP rises with the numerator, so the best integer is next to the crossing.
        var (below, above) = (0, room);
        while (above - below > 1)
        {
            var middle = below + (above - below) / 2;
            if (Rtp(middle) < Target) below = middle; else above = middle;
        }

        var best = Math.Abs(Rtp(below) - Target) < Math.Abs(Rtp(above) - Target) ? below : above;
        var before = Rtp(old);
        var after = Rtp(best);
        return Math.Abs(after - Target) < Math.Abs(before - Target)
            ? new Tuning(old, best, before, after)
            : new Tuning(old, old, before, before);
    }
}
