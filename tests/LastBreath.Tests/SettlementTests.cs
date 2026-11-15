using LastBreath.Core;

namespace LastBreath.Tests;

[Trait("Category", "Common")]
public sealed class SettlementTests
{
    private static readonly GameConfig Default = ConfigLoader.LoadDefault();

    public static TheoryData<int, decimal, decimal> Payouts => new()
    {
        { 50, 0.20m, 0.01m },
        { 250, 1.00m, 0.25m },
        { 3_000, 10.00m, 30.00m },
        { 5_000, 0.40m, 2.00m },
        { 100_000, 2.00m, 200.00m },
        { 1_000_000, 4.00m, 4_000.00m },
        { 2_500_000, 10.00m, 25_000.00m },
    };

    [Theory]
    [MemberData(nameof(Payouts))]
    public void CreditsAreUnitsTimesBetOverAThousand(int units, decimal bet, decimal credits)
    {
        Assert.Equal(credits, Settlement.Credits(units, bet));
    }

    [Fact]
    public void EveryValueUpToTheCapPaysWholeCentsAtEveryBet()
    {
        var fractional = new List<(int Units, decimal Bet)>();

        foreach (var bet in Default.Bets)
            for (var units = 0; units <= Default.Cap; units += 50)
            {
                var cents = Settlement.Credits(units, bet) * 100;
                if (cents != decimal.Truncate(cents)) fractional.Add((units, bet));
            }

        Assert.Empty(fractional);
    }

    [Fact]
    public void ValueOffTheFiftyUnitStepWouldPayAFractionOfACent()
    {
        Assert.Equal(0.005m, Settlement.Credits(25, 0.20m));
    }
}
