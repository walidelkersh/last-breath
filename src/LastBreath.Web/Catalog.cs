using System.Text.Json;
using LastBreath.Core;

namespace LastBreath.Web;

// The numbers a card and the Math panel show for one dive. They are read from the frozen reports
// in reports/, which are embedded at build time, so nothing here is typed in by hand.
public sealed record Figures(
    double Rtp,
    double Sd,
    double HitFrequency,
    double MeanSpins,
    double GrandProbability,
    double SimulatedRtp,
    double SimulatedZ,
    long SimulatedRounds,
    IReadOnlyList<double> FinalCrates)
{
    public string TypicalLength => $"about {Math.Round(MeanSpins, MidpointRounding.AwayFromZero):0} spins";

    public long GrandOdds => (long)Math.Round(1 / GrandProbability);
}

// Id is the dive's key in config/dives.json. Drift is called Static there.
public sealed record DiveInfo(string Id, string Name, string Rule, string Volatility, Figures Figures);

public static class Catalog
{
    // Volatility follows the order of the exact SD per round: Drift, then Tank, then Classic.
    private static readonly (string Id, string Rule, string Volatility)[] Dives =
    [
        ("Classic", "Three breaths, filled back to three whenever a crate lands.", "Medium"),
        ("Static", "Exactly six spins. A crate never changes the count.", "Low"),
        ("Tank", "Four breaths with no refill. Air tanks add breaths, three at most.", "Low to medium"),
    ];

    public static IReadOnlyList<DiveInfo> Load(GameConfig config) =>
        [.. Dives.Select(dive => new DiveInfo(
            dive.Id,
            config.Dives[dive.Id].Name,
            dive.Rule,
            dive.Volatility,
            Parse(Resource($"solve-{dive.Id.ToLowerInvariant()}.json"), Resource($"simulate-{dive.Id.ToLowerInvariant()}.json"))))];

    internal static Figures Parse(string solveJson, string simulateJson)
    {
        using var solve = JsonDocument.Parse(solveJson);
        using var simulate = JsonDocument.Parse(simulateJson);
        var exact = solve.RootElement;
        var mean = simulate.RootElement.GetProperty("mean_award");

        return new Figures(
            exact.GetProperty("rtp").GetDouble(),
            exact.GetProperty("sd").GetDouble(),
            exact.GetProperty("hit_frequency").GetDouble(),
            exact.GetProperty("mean_spins").GetDouble(),
            exact.GetProperty("grand_probability").GetDouble(),
            mean.GetProperty("simulated").GetDouble(),
            mean.GetProperty("z").GetDouble(),
            simulate.RootElement.GetProperty("rounds").GetInt64(),
            [.. exact.GetProperty("final_crate_probabilities").EnumerateArray().Select(chance => chance.GetDouble())]);
    }

    private static string Resource(string name)
    {
        using var stream = typeof(Catalog).Assembly.GetManifestResourceStream(name)
            ?? throw new InvalidOperationException($"report {name} is not embedded");
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
