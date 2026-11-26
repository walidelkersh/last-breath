# Game design

Last Breath is a hold-and-spin game with no base game. A bet buys one dive, which is a complete hold-and-spin round on a board of five columns and three rows. The board starts empty. There are no reels, paylines or bonus to trigger, so the round you pay for is the whole game. The theme is deep-sea salvage: a coin is a cargo crate, a respin is a breath of oxygen, and the clock counts the breaths you have left.

I have built three dives, Classic, Drift and Tank. They all return about 96% of the bet in the long run, and they differ in how long a round lasts and how much it swings. The maths is in [math.md](math.md) and the exact figures are in [par-sheet.md](par-sheet.md). The numbers in this document are written by `scripts/generate_docs.py` from the config and the reports.

## How a round plays

A round starts with an empty board and the dive's starting clock. On each spin every empty cell draws once. It lands a crate with a small chance or stays empty. A crate that lands stays in its cell until the round ends. After the spin the dive's clock rule runs, and that rule is the only thing that sets the dives apart. The round ends when the board is full or the clock reaches zero. If the board fills, any breaths left are lost.

The award is the sum of the coins on the board, plus the Grand if the board is full. It is paid once, at the end of the round. The bet is chosen before the round and stays fixed. The bets are {{bets}} credits.

Money inside the game is a whole number of units, where one unit is a thousandth of the bet. It becomes credits only at settlement, as units times the bet divided by 1,000, in decimal arithmetic. The smallest coin is {{smallest_coin}} the bet, every value is a multiple of it, and every bet is a multiple of 0.20 credits, so a payout is always a whole number of cents.

## Coins, jackpots and the Grand

A crate holds one coin. The coin is drawn from a weight table, and each dive uses one table. There are eight cash coins and three jackpot coins. A jackpot coin is an ordinary crate with a bigger face. It takes one cell and pays its face, and nothing ever doubles or boosts it.

{{ladder}}

The Grand is not a coin. It is a prize of {{grand}} bets that is paid on top of the board when all {{cells}} cells are full. No award can pass {{cap}} bets, and the largest award that can happen is {{classic.max}} bets in Classic and Tank and {{drift.max}} in Drift, so the cap never applies. The weight tables are in [par-sheet.md](par-sheet.md).

## The three dives

**Classic Dive.** The clock starts at {{classic.clock}} breaths. Whenever at least one crate lands, the clock goes back to {{classic.refill}}. A spin that lands nothing costs one breath, so the round ends after {{classic.clock}} dead spins in a row. Each crate is a relief because it refills the air. A round pays nothing in {{classic.nothing}} of cases.

**Drift Dive.** The round is exactly {{drift.clock}} spins, and nothing that lands changes the count. The only way a round is shorter is a full board. It is the calm dive, because it almost always pays something, with a hit frequency of {{drift.hit}}, and it has the lowest standard deviation of the three. Its weight table has no Major, which keeps the big coins out of it. The config calls this dive `Static`, and the lab accepts both `static` and `drift`.

**Tank Dive.** The clock starts at {{tank.clock}} breaths and nothing refills it, so every spin costs one. Air tanks land in empty cells like crates but hold no coin. A tank adds {{tank.tank_breaths}} breaths and clears from its cell in the same spin. A round takes at most {{tank.tank_limit}} tanks, and a tank drawn after the third counts as nothing. A round is short, about {{tank.spins}} spins, and a tank that lands on the last breath can save it.

{{summary}}

Standard deviation orders the dives as Drift, Tank and Classic, from lowest to highest. The client labels them Low, Low to medium and Medium in that order.

## The Grand

A full board needs all {{cells}} cells filled, and a cell fills only when a crate happens to land on it. The Grand comes about 1 round in {{classic.grand_odds}} in Classic, 1 in {{tank.grand_odds}} in Tank and 1 in {{drift.grand_odds}} in Drift. It adds only {{classic.grand_share_rtp}}, {{tank.grand_share_rtp}} and {{drift.grand_share_rtp}} of the RTP, so it is a small part of the return. It is a large part of the swing. The term it adds to $E[A^2]$ is {{classic.grand_share_e2}} of the total in Classic and {{tank.grand_share_e2}} in Tank, against {{drift.grand_share_e2}} in Drift, which is why Classic and Tank swing so much even though most rounds are small.

## Design notes

Boards are sparse by design. Every bet buys a whole round, so the round itself has to return about 96% of the bet. The average coin is worth {{classic.mu}}, {{drift.mu}} and {{tank.mu}} of the bet in the three dives, far below one bet, and a final board holds on average only {{classic.crates}}, {{drift.crates}} and {{tank.crates}} crates out of {{cells}} cells. Busy boards would pay far more than the bet. A hold-and-spin feature that follows a base game can afford busy boards, because it is only part of the return. Here it is all of it, so the chance that a cell fills is small.

The one number I tuned is each dive's crate chance. It is frozen at the integer, out of 1,000,000, that puts the exact RTP closest to 96%, and a test checks that no neighbouring integer is closer. The ladder, the shapes of the weight tables, the Grand, the clock rules and the tank limit are design choices that I made and did not derive.

A round starts on an empty board, so a round can pay nothing. That happens in {{classic.nothing}} of Classic rounds, {{drift.nothing}} of Drift rounds and {{tank.nothing}} of Tank rounds. I chose this over placing starting coins on the board, because those coins would need a draw of their own, and that draw would be a hidden base game.

The tank limit is a rule and also a convenience for the maths. Without it a tank that adds one breath can leave a state unchanged, and the exact solve would need a linear system on an unbounded state space. [math.md](math.md) explains this under Tank.

## The client

The client is a demo with play money. It is a Blazor WebAssembly app that runs the same engine as the lab, in the browser, so every round is played locally with no server and nothing is paid out. I draw the art as SVG from a script in `scripts/art/`, in one flat style with one palette for the dark and the light theme, and the client loads no raster image. Every tile keeps its label and its value as real text on a plate over the picture. On a narrow screen the plate shows only the value, and the label stays in the name and the tooltip of the tile, so the page says the same with or without the pictures. None of the art is rendered from a 3D scene. A player picks a dive and a bet, starts a round and watches the spins run by. The Skip key plays out the rest of a round. The balance is play money and has a reset button. A jackpot that lands is marked on its card, and a round that returns ten times the bet or more says Big win in its summary. A reduce-motion setting turns off the pop of a new tile, the count-up of the board total and the flying numbers, and it applies by itself when the system asks for reduced motion.

The dive cards and the Math panel read their figures from the reports when the site is built, so they show the numbers in [par-sheet.md](par-sheet.md). The Math panel also shows the seed of the most recent round, and `lab play --dive <dive> --seed <seed>` replays that round in the console. Opening the site with `?seed=<number>` makes the rounds repeatable, which the browser tests use.

The browser tests run in Chromium only, so I have not tested the client in any other browser. Free, Wreck and Crew are not built, and nothing in this repository computes them.
