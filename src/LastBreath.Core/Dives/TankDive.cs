namespace LastBreath.Core.Dives;

public static class TankDive
{
    public static Round Play(GameConfig config, DiveConfig dive, IRandomSource random)
    {
        var round = new Round(config, dive);
        var tanksUsed = 0;

        while (!round.IsOver)
        {
            var airTanks = new List<Landed>();
            foreach (var landed in Landing.Draw(config, dive, round.Board, tanksUsed, random))
            {
                if (landed.Outcome.IsTank())
                    airTanks.Add(landed);
                else
                    round.Board[landed.Index] = landed.Cell;
            }

            tanksUsed += airTanks.Count;
            round.EndTurn(round.Clock - 1 + airTanks.Sum(tank => tank.Outcome.Breaths()), [.. airTanks]);
        }

        return round;
    }
}
