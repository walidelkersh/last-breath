namespace LastBreath.Core.Dives;

public static class DriftDive
{
    public static Round Play(GameConfig config, DiveConfig dive, IRandomSource random)
    {
        var round = new Round(config, dive);

        while (!round.IsOver)
        {
            foreach (var crate in Landing.Draw(config, dive, round.Board, 0, random))
                round.Board[crate.Index] = crate.Cell;
            round.EndTurn(round.Clock - 1);
        }

        return round;
    }
}
