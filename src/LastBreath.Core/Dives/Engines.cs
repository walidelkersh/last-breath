namespace LastBreath.Core.Dives;

public static class Engines
{
    // The engine for a dive, named by its key in the config.
    public static Func<GameConfig, DiveConfig, IRandomSource, Round> For(string id) => id switch
    {
        "Classic" => ClassicDive.Play,
        "Static" => DriftDive.Play,
        "Tank" => TankDive.Play,
        _ => throw new ArgumentException($"no engine for dive '{id}'", nameof(id)),
    };
}
