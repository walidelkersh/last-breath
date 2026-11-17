namespace LastBreath.Core.Dives;

public static class ClassicDive
{
    public static Round Play(GameConfig config, DiveConfig dive, IRandomSource random)
    {
        var refill = dive.RefillTo
            ?? throw new ArgumentException("a classic dive needs a refill value", nameof(dive));
        var round = new Round(config, dive);

        while (!round.IsOver)
        {
            var landed = Landing.Draw(config, dive, round.Board, 0, random);
            foreach (var crate in landed)
                round.Board[crate.Index] = crate.Cell;
            round.EndTurn(landed.Count > 0 ? refill : round.Clock - 1);
        }

        return round;
    }
}
