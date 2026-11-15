using System.Text.Json;
using System.Text.Json.Serialization;

namespace LastBreath.Core;

public static class ConfigLoader
{
    private const int UnitStep = 50;
    private const decimal BetStep = 0.20m;

    private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web)
    {
        ReadCommentHandling = JsonCommentHandling.Skip,
        UnmappedMemberHandling = JsonUnmappedMemberHandling.Disallow,
        Converters = { new JsonStringEnumConverter() },
    };

    public static GameConfig LoadDefault()
    {
        using var stream = typeof(ConfigLoader).Assembly.GetManifestResourceStream("dives.json")!;
        using var reader = new StreamReader(stream);
        return Parse(reader.ReadToEnd());
    }

    public static GameConfig Parse(string json)
    {
        var config = JsonSerializer.Deserialize<GameConfig>(json, Options)
            ?? throw new InvalidDataException("config is empty");
        Validate(config);
        return config;
    }

    public static void Validate(GameConfig config)
    {
        foreach (var units in config.CashLadder)
            RequireUnitStep($"cash ladder value {units}", units);
        RequireUnitStep("Mini", config.Jackpots.Mini);
        RequireUnitStep("Minor", config.Jackpots.Minor);
        RequireUnitStep("Major", config.Jackpots.Major);
        RequireUnitStep("Grand", config.Grand);
        RequireUnitStep("cap", config.Cap);

        foreach (var bet in config.Bets)
            if (bet <= 0 || bet % BetStep != 0)
                throw Invalid($"bet {bet} is not a positive multiple of 0.20");

        foreach (var (name, weights) in config.WeightTables)
        {
            if (weights.Length != config.TierCount)
                throw Invalid($"weight table '{name}' has {weights.Length} weights, expected {config.TierCount}");
            if (weights.Any(weight => weight < 0))
                throw Invalid($"weight table '{name}' has a negative weight");
            var total = weights.Sum();
            if (total != GameConfig.WeightTotal)
                throw Invalid($"weight table '{name}' sums to {total}, expected {GameConfig.WeightTotal}");
        }

        foreach (var (id, dive) in config.Dives)
        {
            if (!config.WeightTables.ContainsKey(dive.WeightTable))
                throw Invalid($"dive '{id}' uses the unknown weight table '{dive.WeightTable}'");
            if (dive.Landing.Any(entry => entry.Numerator < 0))
                throw Invalid($"dive '{id}' has a negative landing numerator");
            var numerators = dive.Landing.Sum(entry => entry.Numerator);
            if (numerators > GameConfig.LandingDenominator)
                throw Invalid($"dive '{id}' landing numerators sum to {numerators}, more than {GameConfig.LandingDenominator}");
            if (dive.StartingClock < 1)
                throw Invalid($"dive '{id}' starts with a clock of {dive.StartingClock}");
            if (dive.Landing.Any(entry => entry.Outcome.IsTank()) && dive.TankLimit is null)
                throw Invalid($"dive '{id}' lands tanks but has no tank limit");
        }
    }

    private static void RequireUnitStep(string what, int units)
    {
        if (units <= 0 || units % UnitStep != 0)
            throw Invalid($"{what} is not a positive multiple of {UnitStep} units");
    }

    private static InvalidDataException Invalid(string message) => new($"invalid config: {message}");
}
