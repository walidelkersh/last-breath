using LastBreath.Core;

namespace LastBreath.Tests;

[Trait("Category", "Common")]
public sealed class ConfigTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    private const string MinimalJson = """
        // comments are allowed
        {
          "cashLadder": [50, 100],
          "jackpots": { "mini": 5000, "minor": 20000, "major": 100000 },
          "grand": 1000000,
          "cap": 5000000,
          "bets": [0.20, 1.00],
          "weightTables": { "flat": [60000, 30000, 6000, 3000, 1000] },
          "dives": {
            "Plain": {
              "name": "Plain Dive",
              "weightTable": "flat",
              "landing": [ { "outcome": "Crate", "numerator": 250000 } ],
              "startingClock": 3
            }
          }
        }
        """;

    [Fact]
    public void CommonSectionHoldsTheLadderJackpotsGrandCapAndBets()
    {
        Assert.Equal([50, 100, 200, 250, 500, 1_000, 2_000, 3_000], Default.CashLadder);
        Assert.Equal(5_000, Default.Jackpots.Mini);
        Assert.Equal(20_000, Default.Jackpots.Minor);
        Assert.Equal(100_000, Default.Jackpots.Major);
        Assert.Equal(1_000_000, Default.Grand);
        Assert.Equal(5_000_000, Default.Cap);
        Assert.Equal([0.20m, 0.40m, 1.00m, 2.00m, 4.00m, 10.00m], Default.Bets);
    }

    [Fact]
    public void DivesAreKeyedByFeatureName()
    {
        Assert.Equal(["Classic", "Static", "Tank"], Default.Dives.Keys.Order());
        Assert.Equal("Drift Dive", Default.Dives["Static"].Name);
    }

    [Fact]
    public void ClassicLandsCratesOnAClockOfThreeRefilledToThree()
    {
        var classic = Default.Dives["Classic"];

        Assert.Equal("mixed", classic.WeightTable);
        Assert.Equal(new LandingEntry { Outcome = Outcome.Crate, Numerator = 34_060 }, Assert.Single(classic.Landing));
        Assert.Equal(3, classic.StartingClock);
        Assert.Equal(3, classic.RefillTo);
        Assert.Null(classic.TankLimit);
    }

    [Fact]
    public void DriftPlaysSixSpinsWithNoRefill()
    {
        var drift = Default.Dives["Static"];

        Assert.Equal("shallow", drift.WeightTable);
        Assert.Equal(new LandingEntry { Outcome = Outcome.Crate, Numerator = 81_815 }, Assert.Single(drift.Landing));
        Assert.Equal(6, drift.StartingClock);
        Assert.Null(drift.RefillTo);
    }

    [Fact]
    public void TankLandsThreeTankSizesAndStopsAtThreeTanks()
    {
        var tank = Default.Dives["Tank"];

        Assert.Equal("light", tank.WeightTable);
        Assert.Equal(
            [
                (Outcome.Crate, 93_120),
                (Outcome.TankPlus1, 8_000),
                (Outcome.TankPlus2, 3_000),
                (Outcome.TankPlus3, 1_000),
            ],
            tank.Landing.Select(entry => (entry.Outcome, entry.Numerator)));
        Assert.Equal(4, tank.StartingClock);
        Assert.Equal(3, tank.TankLimit);
    }

    // The sum of weight times units is the mean crate in units times 100,000, worked out by hand.
    [Theory]
    [InlineData("mixed", 29_700_000)]
    [InlineData("shallow", 15_950_250)]
    [InlineData("light", 16_450_000)]
    public void WeightTablesGiveTheirMeanCrateValue(string table, long weightedUnits)
    {
        var weights = Default.WeightTables[table];

        var actual = weights.Select((weight, tier) => (long)weight * Default.Units(tier)).Sum();

        Assert.Equal(weightedUnits, actual);
    }

    [Fact]
    public void DriftHasNoMajor()
    {
        Assert.Equal(0, Default.WeightTables["shallow"][10]);
    }

    // Fifteen of the largest crate the table can land, plus the Grand.
    [Theory]
    [InlineData("Classic", 2_500_000)]
    [InlineData("Static", 1_300_000)]
    [InlineData("Tank", 2_500_000)]
    public void ReachableMaximumStaysBelowTheCap(string dive, int expected)
    {
        var weights = Default.WeightTables[Default.Dives[dive].WeightTable];
        var largestTier = Array.FindLastIndex(weights, weight => weight > 0);

        var maximum = Board.Size * Default.Units(largestTier) + Default.Grand;

        Assert.Equal(expected, maximum);
        Assert.True(maximum < Default.Cap);
    }

    [Theory]
    [InlineData(0, CellKind.Cash, 50)]
    [InlineData(3, CellKind.Cash, 250)]
    [InlineData(7, CellKind.Cash, 3_000)]
    [InlineData(8, CellKind.Jackpot, 5_000)]
    [InlineData(9, CellKind.Jackpot, 20_000)]
    [InlineData(10, CellKind.Jackpot, 100_000)]
    public void TiersRunFromTheCashLadderIntoTheJackpots(int tier, CellKind kind, int units)
    {
        Assert.Equal(new Cell(kind, units), Default.Crate(tier));
    }

    [Fact]
    public void ParseReadsAConfigWithComments()
    {
        var config = ConfigLoader.Parse(MinimalJson);

        var plain = config.Dives["Plain"];
        Assert.Equal(250_000, Assert.Single(plain.Landing).Numerator);
        Assert.Null(plain.RefillTo);
    }

    [Fact]
    public void ParseRejectsAMissingProperty()
    {
        var json = MinimalJson.Replace("\"cap\": 5000000,", "");

        Assert.ThrowsAny<System.Text.Json.JsonException>(() => ConfigLoader.Parse(json));
    }

    [Fact]
    public void ParseRejectsAnUnknownProperty()
    {
        var json = MinimalJson.Replace("\"grand\"", "\"grandPrize\"");

        Assert.ThrowsAny<System.Text.Json.JsonException>(() => ConfigLoader.Parse(json));
    }

    [Fact]
    public void ParseValidatesWhatItReads()
    {
        var json = MinimalJson.Replace("60000", "60001");

        Assert.Throws<InvalidDataException>(() => ConfigLoader.Parse(json));
    }
}
