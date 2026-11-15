using System.Globalization;
using LastBreath.Core;

namespace LastBreath.Tests;

[Trait("Category", "Common")]
public sealed class ConfigValidationTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private static GameConfig WithWeights(string table, int[] weights) =>
        Default with { WeightTables = new(Default.WeightTables) { [table] = weights } };

    private static GameConfig WithDive(string id, DiveConfig dive) =>
        Default with { Dives = new(Default.Dives) { [id] = dive } };

    private static GameConfig WithClassicLanding(params int[] numerators) =>
        WithDive("Classic", Default.Dives["Classic"] with
        {
            Landing = [.. numerators.Select(numerator => new LandingEntry { Outcome = Outcome.Crate, Numerator = numerator })],
        });

    private static string Rejection(GameConfig config) =>
        Assert.Throws<InvalidDataException>(() => ConfigLoader.Validate(config)).Message;

    [Theory]
    [InlineData("ladder")]
    [InlineData("mini")]
    [InlineData("minor")]
    [InlineData("major")]
    [InlineData("grand")]
    [InlineData("cap")]
    public void ValueThatIsNotAMultipleOf50IsRejected(string field)
    {
        var config = field switch
        {
            "ladder" => Default with { CashLadder = [50, 100, 200, 255, 500, 1_000, 2_000, 3_000] },
            "mini" => Default with { Jackpots = Default.Jackpots with { Mini = 5_025 } },
            "minor" => Default with { Jackpots = Default.Jackpots with { Minor = 20_010 } },
            "major" => Default with { Jackpots = Default.Jackpots with { Major = 99_999 } },
            "grand" => Default with { Grand = 1_000_025 },
            _ => Default with { Cap = 5_000_001 },
        };

        Assert.Contains("multiple of 50", Rejection(config));
    }

    [Fact]
    public void ZeroValueIsRejected()
    {
        var config = Default with { Cap = 0 };

        Assert.Contains("multiple of 50", Rejection(config));
    }

    [Theory]
    [InlineData("0.30")]
    [InlineData("0.10")]
    [InlineData("1.05")]
    [InlineData("0")]
    [InlineData("-0.20")]
    public void BetThatIsNotAPositiveMultipleOf020IsRejected(string bet)
    {
        var config = Default with { Bets = [0.20m, decimal.Parse(bet, CultureInfo.InvariantCulture)] };

        Assert.Contains("multiple of 0.20", Rejection(config));
    }

    [Theory]
    [InlineData(-1)]
    [InlineData(1)]
    public void WeightTableThatDoesNotSumTo100000IsRejected(int offByUnits)
    {
        int[] weights = [.. Default.WeightTables["mixed"]];
        weights[0] += offByUnits;

        var message = Rejection(WithWeights("mixed", weights));

        Assert.Contains("'mixed'", message);
        Assert.Contains("100000", message);
    }

    [Fact]
    public void NegativeWeightIsRejectedEvenWhenTheTableStillSumsTo100000()
    {
        int[] weights = [.. Default.WeightTables["mixed"]];
        weights[0] -= 40_000;
        weights[1] += 40_000;

        Assert.Contains("negative weight", Rejection(WithWeights("mixed", weights)));
    }

    [Fact]
    public void WeightTableWithTheWrongNumberOfTiersIsRejected()
    {
        var message = Rejection(WithWeights("mixed", [50_000, 50_000]));

        Assert.Contains("expected 11", message);
    }

    [Fact]
    public void LandingNumeratorsAboveAMillionAreRejected()
    {
        var message = Rejection(WithClassicLanding(600_000, 400_001));

        Assert.Contains("1000001", message);
    }

    [Fact]
    public void LandingNumeratorsOfExactlyAMillionAreAccepted()
    {
        var config = WithClassicLanding(600_000, 400_000);

        Assert.Null(Record.Exception(() => ConfigLoader.Validate(config)));
    }

    [Fact]
    public void NegativeLandingNumeratorIsRejected()
    {
        Assert.Contains("negative landing", Rejection(WithClassicLanding(-1, 34_060)));
    }

    [Fact]
    public void DiveWithAnUnknownWeightTableIsRejected()
    {
        var config = WithDive("Classic", Default.Dives["Classic"] with { WeightTable = "deep" });

        Assert.Contains("'deep'", Rejection(config));
    }

    [Fact]
    public void DiveThatStartsWithAnEmptyClockIsRejected()
    {
        var config = WithDive("Static", Default.Dives["Static"] with { StartingClock = 0 });

        Assert.Contains("clock of 0", Rejection(config));
    }

    [Fact]
    public void DiveThatLandsTanksNeedsATankLimit()
    {
        var config = WithDive("Tank", Default.Dives["Tank"] with { TankLimit = null });

        Assert.Contains("no tank limit", Rejection(config));
    }
}
