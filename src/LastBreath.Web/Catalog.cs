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
    double SpinVariance,
    IReadOnlyList<double> FinalCrates)
{
    // The mean number of spins, rounded, with "about" in front. Only a dive whose rounds do not vary, which is a spin variance under 0.01, as Drift's
    // exactly six, drops it. A mean that happens to be near a whole number says nothing of the rounds: Tank's is 5.01 and its rounds run from 1 to 14.
    public string TypicalLength => $"{(SpinVariance < 0.01 ? "" : "about ")}{Math.Round(MeanSpins, MidpointRounding.AwayFromZero):0} spins";

    public long GrandOdds => (long)Math.Round(1 / GrandProbability);
}

// Id is the dive's key in config/dives.json. Drift is called Static there. Line is what the card says in the player view, and Rule
// what it says in the maths view. Waves is the volatility drawn as one to three waves.
public sealed record DiveInfo(string Id, string Name, string Line, string Rule, string Volatility, int Waves, Figures Figures);

public static class Catalog
{
    // Volatility follows the order of the exact SD per round: Drift, then Tank, then Classic.
    private static readonly (string Id, string Line, string Rule, string Volatility, int Waves)[] Dives =
    [
        ("Classic", "Every crate fills your air back to three.", "Three breaths, filled back to three whenever a crate lands.", "Medium", 3),
        ("Static", "Six spins, always. The calmest water.", "Exactly six spins. A crate never changes the count.", "Low", 1),
        ("Tank", "No refills. Find air tanks to stay down.", "Four breaths with no refill. Air tanks add breaths, up to three tanks a round.", "Low to medium", 2),
    ];

    public static IReadOnlyList<DiveInfo> Load(GameConfig config) =>
        [.. Dives.Select(dive => new DiveInfo(
            dive.Id,
            config.Dives[dive.Id].Name,
            dive.Line,
            dive.Rule,
            dive.Volatility,
            dive.Waves,
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
            simulate.RootElement.GetProperty("spin_variance").GetDouble(),
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
