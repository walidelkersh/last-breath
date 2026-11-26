using LastBreath.Core;
using LastBreath.Web;

namespace LastBreath.Tests;

[Trait("Category", "Client")]
public sealed class CatalogTests
{
    private const string Solve = """
        { "dive": "x", "rtp": 0.96, "sd": 6.5, "hit_frequency": 0.8, "mean_spins": 7.5,
          "grand_probability": 0.0001, "mean_crates": 3,
          "final_crate_probabilities": [0.5, 0.3, 0.2] }
        """;

    private const string Simulate = """
        { "dive": "x", "rounds": 10000000, "seed": 1, "spin_variance": 2.0,
          "mean_award": { "simulated": 0.97, "exact": 0.96, "z": 1.5, "within_three_se": true } }
        """;

    [Fact]
    public void FiguresComeFromTheSolveAndSimulateReports()
    {
        var figures = Catalog.Parse(Solve, Simulate);

        Assert.Equal(0.96, figures.Rtp);
        Assert.Equal(6.5, figures.Sd);
        Assert.Equal(0.8, figures.HitFrequency);
        Assert.Equal(0.97, figures.SimulatedRtp);
        Assert.Equal(1.5, figures.SimulatedZ);
        Assert.Equal(10_000_000, figures.SimulatedRounds);
        Assert.Equal([0.5, 0.3, 0.2], figures.FinalCrates);
    }

    [Fact]
    public void TheGrandOddsAreOneOverTheProbabilityAndTheLengthRoundsHalvesUp()
    {
        var figures = Catalog.Parse(Solve, Simulate);

        Assert.Equal(10_000, figures.GrandOdds);
        Assert.Equal("about 8 spins", figures.TypicalLength);
    }

    // Drift always plays six spins, so its variance is 0. Tank's mean is 5.0089 and yet its rounds vary (variance 2.02), so it is about 5.
    [Theory]
    [InlineData(0.0, 6.0, "6 spins")]
    [InlineData(0.005, 6.0, "6 spins")]
    [InlineData(0.01, 6.0, "about 6 spins")]
    [InlineData(2.02, 5.0089, "about 5 spins")]
    [InlineData(17.3, 7.40, "about 7 spins")]
    public void TheTypicalLengthSaysAboutUnlessTheLengthOfARoundDoesNotVary(double variance, double mean, string printed)
    {
        var invariant = System.Globalization.CultureInfo.InvariantCulture;
        var solve = Solve.Replace("\"mean_spins\": 7.5", $"\"mean_spins\": {mean.ToString(invariant)}");
        var simulate = Simulate.Replace("\"spin_variance\": 2.0", $"\"spin_variance\": {variance.ToString(invariant)}");

        Assert.Equal(printed, Catalog.Parse(solve, simulate).TypicalLength);
    }

    [Fact]
    public void TheSpinVarianceComesFromTheSimulateReport()
    {
        Assert.Equal(2.0, Catalog.Parse(Solve, Simulate).SpinVariance);
    }

    [Fact]
    public void EachCardShowsTheNameFromTheConfigAndANinetySixPercentRtp()
    {
        var dives = Catalog.Load(ConfigLoader.LoadDefault());

        Assert.Equal(["Classic Dive", "Drift Dive", "Tank Dive"], dives.Select(dive => dive.Name));
        Assert.All(dives, dive => Assert.Equal("96.00%", Format.Percent(dive.Figures.Rtp)));
    }

    [Fact]
    public void VolatilityLabelsFollowTheOrderOfTheExactSdPerRound()
    {
        var dives = Catalog.Load(ConfigLoader.LoadDefault());

        var bySd = dives.OrderBy(dive => dive.Figures.Sd).Select(dive => dive.Volatility);

        Assert.Equal(["Low", "Low to medium", "Medium"], bySd);
    }

    [Theory]
    [InlineData(1000, "1,000.00")]
    [InlineData(0.05, "0.05")]
    [InlineData(12.5, "12.50")]
    public void CreditsAlwaysShowTwoDecimalsAndGroupThousands(double value, string expected) =>
        Assert.Equal(expected, Format.Credits((decimal)value));
}
