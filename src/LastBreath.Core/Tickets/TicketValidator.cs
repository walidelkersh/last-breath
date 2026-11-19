namespace LastBreath.Core.Tickets;

// Checks a ticket against the rules of its dive. It stops at the first broken rule and says which
// rule, which turn and which cell.
public sealed class TicketValidator
{
    private const string Classic = "Classic";
    private const string Static = "Static";
    private const string Tank = "Tank";

    private static readonly string[] KnownFeatures = [Classic, Static, Tank];

    private readonly GameConfig _config;
    private readonly HashSet<int> _legalCashValues;

    public TicketValidator(GameConfig config)
    {
        if (config.CashLadder.Length == 0)
            throw new ArgumentException("Cash ladder cannot be empty.", nameof(config));
        _config = config;
        _legalCashValues = new HashSet<int>(config.CashLadder);
    }

    public void ValidatePool(IReadOnlyList<Ticket> tickets)
    {
        var ids = new HashSet<string>();
        for (var index = 0; index < tickets.Count; index++)
        {
            ValidateTicket(tickets[index]);
            if (!ids.Add(tickets[index].TicketId))
                throw new InvalidOperationException($"Duplicate ticket id '{tickets[index].TicketId}' at ticket {index + 1}.");
        }
    }

    // The first rule the ticket breaks, or null if it keeps them all.
    public string? Problem(Ticket ticket)
    {
        try
        {
            ValidateTicket(ticket);
            return null;
        }
        catch (Exception problem) when (problem is ArgumentException or InvalidOperationException)
        {
            return problem.Message;
        }
    }

    public void ValidateTicket(Ticket ticket)
    {
        if (ticket is null)
            throw new ArgumentNullException(nameof(ticket), "Ticket cannot be null.");
        if (string.IsNullOrWhiteSpace(ticket.FeatureName))
            throw new ArgumentException("Feature name cannot be null or empty.", nameof(ticket.FeatureName));
        if (ticket.FreeGamesTurns is null || ticket.FreeGamesTurns.Count == 0)
            throw new ArgumentException("Ticket must contain at least one turn.", nameof(ticket.FreeGamesTurns));

        var feature = ticket.FeatureName;
        var turns = ticket.FreeGamesTurns;
        if (!KnownFeatures.Contains(feature))
            throw new InvalidOperationException($"Unknown feature name '{feature}'. Expected one of: {string.Join(", ", KnownFeatures.Select(name => $"'{name}'"))}.");

        var dive = _config.Dives[feature];
        if (feature == Static && turns.Count > dive.StartingClock)
            throw new InvalidOperationException($"For feature '{Static}', expected at most {dive.StartingClock} turns, but found {turns.Count}.");

        var refill = feature == Classic
            ? dive.RefillTo ?? throw new InvalidOperationException("The Classic dive needs a refill value in the config.")
            : 0;
        var deadSpinsToEnd = refill;
        var maxDeadSpinsBeforeHit = refill - 1;
        var tankLimit = dive.TankLimit ?? 0;

        // A zero weight means the dive can never land that jackpot, so its value is not legal there.
        var weights = _config.WeightTables[dive.WeightTable];
        var jackpots = new[] { _config.Jackpots.Mini, _config.Jackpots.Minor, _config.Jackpots.Major };
        var legalJackpotValues = jackpots.Where((_, tier) => weights[_config.CashLadder.Length + tier] > 0).ToHashSet();

        var previousTotal = 0;
        var previousCount = 0;
        var previousClock = dive.StartingClock;
        var sumOfTurnWins = 0;
        var deadInARowCount = 0;
        var tanksUsed = 0;
        TicketTurn? previousTurn = null;
        for (var turnIndex = 0; turnIndex < turns.Count; turnIndex++)
        {
            var turn = turns[turnIndex];
            var turnNumber = turnIndex + 1;
            if (turn is null || !IsBoard(turn.Symbols) || !IsBoard(turn.CashOnReels) || turn.AirTanks is null)
                throw new InvalidOperationException($"Turn {turnNumber} must have a {Board.Columns} by {Board.Rows} board and an air tank list.");

            var boardTotal = 0;
            var coinCount = 0;
            for (var col = 0; col < Board.Columns; col++)
            {
                for (var row = 0; row < Board.Rows; row++)
                {
                    var symbol = turn.Symbols[col][row];
                    var value = turn.CashOnReels[col][row];
                    var previousSymbol = previousTurn?.Symbols[col][row] ?? TicketSymbol.Empty;
                    var previousValue = previousTurn?.CashOnReels[col][row] ?? 0;
                    if (previousSymbol != TicketSymbol.Empty && (symbol != previousSymbol || value != previousValue))
                        throw new InvalidOperationException($"Coin moved or changed at turn {turnNumber}, position ({col}, {row}).");

                    if (symbol == TicketSymbol.CashOnReel)
                    {
                        if (!_legalCashValues.Contains(value))
                            throw new InvalidOperationException($"Illegal coin value {value} found at turn {turnNumber}, position ({col}, {row}).");
                        boardTotal += value;
                        coinCount++;
                    }
                    else if (symbol == TicketSymbol.Jackpot)
                    {
                        if (!legalJackpotValues.Contains(value))
                            throw new InvalidOperationException($"Illegal jackpot value {value} found at turn {turnNumber}, position ({col}, {row}).");
                        boardTotal += value;
                        coinCount++;
                    }
                    else if (symbol == TicketSymbol.Empty)
                    {
                        if (value != 0)
                            throw new InvalidOperationException($"Expected empty value at turn {turnNumber}, position ({col}, {row}), but found {value}.");
                    }
                    else
                    {
                        throw new InvalidOperationException($"Unknown symbol '{symbol}' found at turn {turnNumber}, position ({col}, {row}).");
                    }
                }
            }

            if (boardTotal - previousTotal != turn.TurnWin)
                throw new InvalidOperationException($"Turn win mismatch at turn {turnNumber}. Expected: {boardTotal - previousTotal}, Found: {turn.TurnWin}.");

            if (feature == Classic)
            {
                if (turn.TurnWin == 0)
                {
                    deadInARowCount++;
                    if (deadInARowCount > deadSpinsToEnd)
                        throw new InvalidOperationException($"Dead in a row count exceeded at turn {turnNumber}. Maximum allowed is {deadSpinsToEnd}, but found {deadInARowCount}.");
                }
                else
                {
                    if (deadInARowCount > maxDeadSpinsBeforeHit)
                        throw new InvalidOperationException($"Dead in a row count exceeded before a hit at turn {turnNumber}. Maximum allowed is {maxDeadSpinsBeforeHit}, but found {deadInARowCount}.");
                    deadInARowCount = 0;
                }
            }

            var emptyCellsBefore = Board.Size - previousCount;
            var newCoins = coinCount - previousCount;
            if (newCoins < 0 || newCoins > emptyCellsBefore)
                throw new InvalidOperationException($"Invalid number of new coins at turn {turnNumber}. Expected between 0 and {emptyCellsBefore}, Found: {newCoins}.");

            var expectedClock = feature == Classic && newCoins > 0 ? refill : previousClock - 1;
            if (feature == Tank)
            {
                tanksUsed += turn.AirTanks.Count;
                if (tanksUsed > tankLimit)
                    throw new InvalidOperationException($"Too many air tanks at turn {turnNumber}. Maximum allowed is {tankLimit}, but found {tanksUsed}.");
                expectedClock += AirTankBreaths(dive, turn, previousTurn, turnNumber);
            }
            else if (turn.AirTanks.Count > 0)
            {
                throw new InvalidOperationException($"Feature '{feature}' cannot have air tanks, found {turn.AirTanks.Count} at turn {turnNumber}.");
            }

            if (turn.ClockAfter != expectedClock)
                throw new InvalidOperationException($"Clock mismatch at turn {turnNumber}. Expected: {expectedClock}, Found: {turn.ClockAfter}.");
            if (feature == Tank && turn.ClockAfter == 0 && turnIndex < turns.Count - 1)
                throw new InvalidOperationException($"Clock ran out at turn {turnNumber}, but the ticket continues.");

            sumOfTurnWins += turn.TurnWin;
            previousTotal = boardTotal;
            previousCount = coinCount;
            previousClock = turn.ClockAfter;
            previousTurn = turn;
        }

        if (previousCount == Board.Size)
        {
            if (turns[^1].TurnWin == 0)
                throw new InvalidOperationException($"Last turn must have had new coins when board total is {Board.Size}.");
        }
        else if (feature == Classic)
        {
            if (deadInARowCount != deadSpinsToEnd)
                throw new InvalidOperationException($"Dead in a row count must be equal to {deadSpinsToEnd} when board total is not {Board.Size}. Found: {deadInARowCount}.");
        }
        else if (feature == Static)
        {
            if (turns.Count != dive.StartingClock)
                throw new InvalidOperationException($"For feature '{Static}', expected {dive.StartingClock} turns unless the board fills, but found {turns.Count}.");
        }
        else if (previousClock != 0)
        {
            throw new InvalidOperationException($"Clock must be 0 when board total is not {Board.Size}. Found: {previousClock}.");
        }

        if (sumOfTurnWins != ticket.CoinWin)
            throw new InvalidOperationException($"Coin win mismatch. Expected: {ticket.CoinWin}, Found: {sumOfTurnWins}.");
        if (previousTotal != ticket.CoinWin)
            throw new InvalidOperationException($"Final board total mismatch. Expected: {ticket.CoinWin}, Found: {previousTotal}.");

        var expectedGrand = previousCount == Board.Size ? _config.Grand : 0;
        if (ticket.GrandWin != expectedGrand)
            throw new InvalidOperationException($"Grand win mismatch. Expected: {expectedGrand}, Found: {ticket.GrandWin}.");
        if (ticket.TotalWin != ticket.CoinWin + ticket.GrandWin)
            throw new InvalidOperationException($"Total win mismatch. Expected: {ticket.CoinWin + ticket.GrandWin}, Found: {ticket.TotalWin}.");
    }

    private static bool IsBoard<T>(T[][] grid) =>
        grid is not null && grid.Length == Board.Columns && grid.All(column => column is not null && column.Length == Board.Rows);

    private static int AirTankBreaths(DiveConfig dive, TicketTurn turn, TicketTurn? previousTurn, int turnNumber)
    {
        var legalBreaths = dive.Landing
            .Where(entry => entry.Outcome.IsTank() && entry.Numerator > 0)
            .Select(entry => entry.Outcome.Breaths())
            .ToHashSet();
        var places = new HashSet<(int, int)>();
        var breaths = 0;
        foreach (var tank in turn.AirTanks)
        {
            var position = $"position ({tank.Col}, {tank.Row})";
            if (tank.Col < 0 || tank.Col >= Board.Columns || tank.Row < 0 || tank.Row >= Board.Rows)
                throw new InvalidOperationException($"Air tank is off the board at turn {turnNumber}, {position}.");
            if (!legalBreaths.Contains(tank.Plus))
                throw new InvalidOperationException($"Illegal air tank value {tank.Plus} found at turn {turnNumber}, {position}.");
            if (!places.Add((tank.Col, tank.Row)))
                throw new InvalidOperationException($"Two air tanks share a cell at turn {turnNumber}, {position}.");
            if ((previousTurn?.Symbols[tank.Col][tank.Row] ?? TicketSymbol.Empty) != TicketSymbol.Empty)
                throw new InvalidOperationException($"Air tank landed on an occupied cell at turn {turnNumber}, {position}.");
            if (turn.Symbols[tank.Col][tank.Row] != TicketSymbol.Empty)
                throw new InvalidOperationException($"Air tank is still on the board at turn {turnNumber}, {position}.");
            breaths += tank.Plus;
        }
        return breaths;
    }
}
