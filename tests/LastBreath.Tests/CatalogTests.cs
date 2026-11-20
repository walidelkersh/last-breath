using LastBreath.Core;
using LastBreath.Web;

namespace LastBreath.Tests;

[Trait("Category", "Client")]
public sealed class CatalogTests
{
    private const string Solve = """
        { "dive": "x", "rtp": 0.96, "sd": 6.5, "hit_frequency": 0.8, "mean_spins": 7.5,
          "grand_probability": 0.0001, "mean_crates": 3 }
        """;

    private const string Simulate = """
        { "dive": "x", "rounds": 10000000, "seed": 1,
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
    }

    [Fact]
    public void TheGrandOddsAreOneOverTheProbabilityAndTheLengthRoundsHalvesUp()
    {
        var figures = Catalog.Parse(Solve, Simulate);

        Assert.Equal(10_000, figures.GrandOdds);
        Assert.Equal("about 8 spins", figures.TypicalLength);
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
