# The math of Last Breath

This document sets out the rules of the three dives I have built as maths, the exact figures that follow from them, and how I checked those figures. The script `scripts/generate_docs.py` writes every number in it from `config/dives.json` and from `reports/`, for config version {{version}}. Money is in bets unless I say otherwise. [par-sheet.md](par-sheet.md) has the full tables, and [game-design.md](game-design.md) has the rules in plain words.

## What the dives share

A round starts on an empty board of {{cells}} cells. On every spin each empty cell draws once, and the draws are independent. A cell lands a crate with the dive's probability $p$ and otherwise stays empty. A crate stays in its cell for the rest of the round, so cells only fill up. The round ends when the board is full or the clock runs out. A full board pays the Grand of {{grand}} bets on top of the coins on the board. Tank has one more outcome, the air tank, which I describe in its own section.

A crate holds a coin. The coin is drawn from the dive's weight table, and that draw is independent of whether, where and when the crate landed. The clock only asks whether something landed and never what it was worth. These two facts make the number $N$ of crates on the final board independent of the coin values, so the award is

```math
A = \sum_{i=1}^{N} V_i + G\,\mathbf{1}[N = 15],
```

where the $V_i$ are independent coin values with mean $\mu$ and variance $\sigma^2$, and $G$ is the Grand. Everything below follows from the law of $N$. Given $N = m$ the coins add to a sum with mean $m\mu$ and variance $m\sigma^2$, and a full board adds $G$ to it. Taking expectations gives the RTP and the second moment:

```math
\begin{aligned}
\mathrm{RTP} = E[A] &= \mu\,E[N] + G\,P(N = 15),\\
E[A^2] &= \sigma^2 E[N] + \mu^2 E[N^2] + 2G\mu \cdot 15\,P(N = 15) + G^2 P(N = 15),\\
\mathrm{SD}(A) &= \sqrt{E[A^2] - E[A]^2}.
\end{aligned}
```

A round pays something exactly when at least one crate lands, because the smallest coin is worth {{smallest_coin}}. So the hit frequency is $1 - P(N = 0)$, and the chance of the Grand is $P(N = 15)$. The largest award that can happen is $15\,V_{\max} + G$, where $V_{\max}$ is the largest coin with a weight above zero. The cap of {{cap}} bets is higher than every reachable maximum, so it never binds and the formulas need no cap term. The engine still applies it, so a wrong config could not overpay.

The solver finds the law of $N$ and the expected number of spins exactly, by backward induction over states, and the formulas above give the rest. It also builds the whole award distribution by convolving the coin law $N$ times. The simulator uses that distribution for its chi-square test on the award.

A state only has to remember what the future depends on. Every empty cell draws from the same table, so it does not matter which cells are empty, only how many. That is why a state counts crates and never positions.

### The coin tables

Weights are out of 100,000. Classic draws from the mixed table, Drift from the shallow table and Tank from the light table. The shallow table has no Major.

{{coins}}

The coin mean $\mu$ is {{classic.mu}} for the mixed table, {{drift.mu}} for the shallow table and {{tank.mu}} for the light table. The variances $\sigma^2$ are {{classic.var}}, {{drift.var}} and {{tank.var}}.

## Classic

The clock starts at {{classic.clock}} breaths. A spin that lands at least one crate sets the clock back to {{classic.refill}}, and a spin that lands nothing lowers it by one. The round ends on a full board or when the clock reaches 0. Each empty cell lands a crate with probability $p$, which is {{classic.numerator}} in 1,000,000, or {{classic.p}}.

**State space.** A state is $(n, o)$, with $n$ crates on the board and $o$ breaths left. With $e = 15 - n$ empty cells, the number $K$ of crates that land on the next spin is binomial, with probability mass $b_e(k) = \binom{e}{k} p^k (1-p)^{e-k}$. Let $F_{n,o}(m)$ be the probability that the round ends with $m$ crates when it starts from $(n, o)$. After a spin the clock is $o'$, and the round has ended if the board is full or $o' = 0$:

```math
o' = \begin{cases} o - 1 & K = 0,\\ {{classic.refill}} & K \ge 1, \end{cases}
\qquad
F_{n,o}(m) = \sum_{k=0}^{e} b_e(k)\,\Phi_k(m),
\qquad
\Phi_k(m) = \begin{cases}
\mathbf{1}[m = n + k] & n + k = 15 \text{ or } o' = 0,\\
F_{n+k,\,o'}(m) & \text{otherwise.}
\end{cases}
```

The expected number of spins $S_{n,o}$ follows the same recursion, with $S_{n,o} = 1 + \sum_k b_e(k)\,S_{\text{next}}$ and $S = 0$ once the round has ended. The state $(n, o)$ needs only states with more crates or with the same crates and fewer breaths. I fill the table with $n$ from 14 down to 0 and $o$ from 1 up to {{classic.refill}}, which is one pass over {{classic.states}} states, and read the answer from $F_{0,{{classic.clock}}}$.

**A check by hand.** A round ends with no crates only if all {{classic.clock}} of its spins land nothing, and a spin lands nothing only if all {{cells}} empty cells miss. So

```math
P(N = 0) = \left((1-p)^{15}\right)^{3} = (1-p)^{45}.
```

With $p$ = {{classic.p}} that is {{classic.nothing}}, the first entry of the distribution below. The script that writes this document stops if the formula and the report differ by more than $10^{-12}$.

**Exact figures.**

{{figures.classic}}

**Final crate distribution.**

{{distribution.classic}}

The Grand is rare, and it carries {{classic.grand_share_rtp}} of the RTP but {{classic.grand_share_e2}} of $E[A^2]$.

**Checks.** The simulated figures come from {{classic.rounds}} rounds of the real engine with seed {{classic.seed}}.

{{checks.classic}}

The mean award is {{classic.sim_dist}} standard errors from the exact RTP, and its 99% interval is {{classic.sim_low}} to {{classic.sim_high}}. The chi-square of the final crate count is {{classic.chi_crates}} on {{classic.chi_crates_df}} degrees of freedom, against a limit of {{classic.chi_crates_limit}} at the 0.001 level. The chi-square of the award in {{classic.buckets}} buckets is {{classic.chi_award}} on {{classic.chi_award_df}} degrees of freedom, against {{classic.chi_award_limit}}. The first {{classic.tickets_checked}} rounds were turned into tickets and validated, and {{classic.tickets_invalid}} failed. The pool export of {{classic.pool_tickets}} tickets with seed {{classic.pool_seed}} had {{classic.pool_valid}} valid, and its mean win was {{classic.pool_mean}} against the exact {{classic.pool_exact}}, inside the 99% interval {{classic.pool_low}} to {{classic.pool_high}}.

## Drift

Drift plays exactly {{drift.clock}} spins, and a landing never changes that. Each empty cell lands a crate with probability $p$, which is {{drift.numerator}} in 1,000,000, or {{drift.p}}. Suppose for a moment that the round always plays all {{drift.clock}} spins. Each cell then behaves on its own, and it is still empty at the end only if it missed every time. So $N$ is binomial and there is a closed form:

```math
q = 1 - (1-p)^{6}, \qquad N \sim \mathrm{Binomial}(15, q), \qquad P(N = m) = \binom{15}{m} q^m (1-q)^{15-m}.
```

The mean number of crates is $15q$. The real round stops early on a full board. That shortens the round but cannot change $N$, because no cell is left to fill. Spin $t + 1$ is played exactly when the board is not full after $t$ spins, so

```math
E[\text{spins}] = \sum_{t=0}^{5} \left(1 - \left(1 - (1-p)^{t}\right)^{15}\right).
```

Only a full board stops Drift early, so the mean number of spins is {{drift.clock}} minus {{drift.spins_short}}. The solver also runs a backward induction over $(n, s)$, where $s$ is the spins left, which is {{drift.states}} states. A test checks the closed form against it. The script that writes this document recomputes $15q$ and all 16 values of $P(N = m)$ and stops if any differs from the report by more than $10^{-12}$.

**Exact figures.**

{{figures.drift}}

**Final crate distribution.**

{{distribution.drift}}

The Grand carries {{drift.grand_share_rtp}} of the RTP and {{drift.grand_share_e2}} of $E[A^2]$, which is much less than in the other two dives.

**Checks.** The simulated figures come from {{drift.rounds}} rounds of the real engine with seed {{drift.seed}}.

{{checks.drift}}

The mean number of spins differs from {{drift.clock}} by only {{drift.spins_short}}, so the standard error of that row is tiny and its difference in standard errors says little. The mean award is {{drift.sim_dist}} standard errors from the exact RTP, and its 99% interval is {{drift.sim_low}} to {{drift.sim_high}}. The chi-square of the final crate count is {{drift.chi_crates}} on {{drift.chi_crates_df}} degrees of freedom, against a limit of {{drift.chi_crates_limit}} at the 0.001 level. The chi-square of the award in {{drift.buckets}} buckets is {{drift.chi_award}} on {{drift.chi_award_df}} degrees of freedom, against {{drift.chi_award_limit}}. The first {{drift.tickets_checked}} rounds were turned into tickets and validated, and {{drift.tickets_invalid}} failed. The pool export of {{drift.pool_tickets}} tickets with seed {{drift.pool_seed}} had {{drift.pool_valid}} valid, and its mean win was {{drift.pool_mean}} against the exact {{drift.pool_exact}}, inside the 99% interval {{drift.pool_low}} to {{drift.pool_high}}.

## Tank

The clock starts at {{tank.clock}} breaths and nothing refills it, so every spin costs one breath. An empty cell now has four outcomes: a crate with probability $p$, an air tank worth $+j$ breaths with probability $t_j$ for $j = 1, 2, 3$, or nothing. The numerators are in the table below. A tank counts only while fewer than {{tank.tank_limit}} have counted in the round. A tank drawn after that counts as nothing. Counted tanks add their breaths and clear in the same spin, so a tank never fills a cell, and a full board always means 15 crates.

{{landing.tank}}

**State space.** A state is $(n, o, k)$: crates on the board, breaths left and tanks counted so far. A spin from $(n, o, k)$ lands $c$ crates, counts $r$ tanks and adds $a$ breaths. The next state is $(n + c,\ o - 1 + a,\ k + r)$, and the round has ended if $n + c = 15$ or $o - 1 + a = 0$. Tank types do not depend on the cell, so the first $r$ counted tanks are $r$ independent draws, and the law of $(c, r, a)$ does not depend on the order of the cells. The solver builds it by folding the empty cells one at a time over $(c, k, a)$, and the recursion has the same shape as Classic:

```math
F_{n,o,k}(m) = \sum_{c,\,r,\,a} \Pr(c, r, a \mid e, k)\,\Phi(m),
\qquad
\Phi(m) = \begin{cases}
\mathbf{1}[m = n + c] & n + c = 15 \text{ or } o - 1 + a = 0,\\
F_{n+c,\;o-1+a,\;k+r}(m) & \text{otherwise.}
\end{cases}
```

**Why a pass is enough.** Every move either raises $n$ because a crate landed, raises $k$ because a tank counted, or lowers $o$ because nothing happened. Without the limit this would fail. A spin that lands one +1 tank and no crate maps $(n, o)$ to itself, and $o$ would have no upper bound, so the solve would need a linear system on an infinite state space. With the limit there are no cycles. I fill the table with $k$ from {{tank.tank_limit}} down to 0, then $n$ from 14 down to 0, then $o$ from 1 up. With $k$ tanks counted the clock is at most the starting clock plus three breaths per tank, so it never passes {{tank.breath_ceiling}}. The solver visits {{tank.states}} states. A test checks that Tank with no tanks and Classic's refill solves to Classic's answer within $10^{-15}$.

**Exact figures.**

{{figures.tank}}

**Final crate distribution.**

{{distribution.tank}}

The Grand carries {{tank.grand_share_rtp}} of the RTP and {{tank.grand_share_e2}} of $E[A^2]$.

**Checks.** The simulated figures come from {{tank.rounds}} rounds of the real engine with seed {{tank.seed}}.

{{checks.tank}}

The mean award is {{tank.sim_dist}} standard errors from the exact RTP, and its 99% interval is {{tank.sim_low}} to {{tank.sim_high}}. The chi-square of the final crate count is {{tank.chi_crates}} on {{tank.chi_crates_df}} degrees of freedom, against a limit of {{tank.chi_crates_limit}} at the 0.001 level. The chi-square of the award in {{tank.buckets}} buckets is {{tank.chi_award}} on {{tank.chi_award_df}} degrees of freedom, against {{tank.chi_award_limit}}. The first {{tank.tickets_checked}} rounds were turned into tickets and validated, and {{tank.tickets_invalid}} failed. The pool export of {{tank.pool_tickets}} tickets with seed {{tank.pool_seed}} had {{tank.pool_valid}} valid, and its mean win was {{tank.pool_mean}} against the exact {{tank.pool_exact}}, inside the 99% interval {{tank.pool_low}} to {{tank.pool_high}}.

## How I checked the figures

I used four checks, and each one catches a different kind of mistake.

The exact solver is C# in `src/LastBreath.Core/Analysis`, and `lab solve --all` writes its results to `reports/solve-<dive>.json`. Its tests include hand-worked cases, the Drift closed form against its induction, Tank against Classic as described above, and each solver against 200,000 rounds of its own engine.

`scripts/independent_check.py` recomputes the same figures in Python with `fractions.Fraction`, using only the standard library and none of the C# code. It uses different methods. It pushes probability forward from the empty board until every round has ended, and it counts the crates and tanks that land on a spin with a multinomial over the empty cells, where the solver folds the cells one at a time. It compares the RTP, $E[A^2]$, the hit frequency, the mean spins, the Grand probability and all 16 crate probabilities with the reports, and it fails on any difference above $10^{-12}$. The continuous integration run does this on every push to the main branch and on every pull request.

`lab simulate` plays the real engines from one PCG32 stream and compares the result with the exact solve. It requires the mean award, the hit frequency and the mean spins to be within 3 standard errors, and the two chi-squares to be under their limits. The mean award is tested twice, once with the textbook standard error and once with the standard error of 100 batch means. The first {{classic.tickets_checked}} rounds of each run are also converted to tickets and checked against the rules of their dive. The validator replays the board, the clock and the totals of every turn.

`lab export-pool` plays {{pool_tickets}} tickets from seed {{pool_seed}}, validates each one and refuses to write the pool unless all of them pass. The pool is too large to track, so only the report next to it is in the repository.

To redo most of it, run `bash scripts/reproduce.sh`. It regenerates the solve reports, runs the Python check, runs the simulation with seed {{seed}}, and rewrites these documents. It does not rerun the pool export, which takes `lab export-pool --dive classic,static,tank --tickets {{pool_tickets}}`.

## What these checks do not show

- The {{rounds}}-round runs use one seed per dive, and the reports hold one run each. The result of a single seed is one draw from a distribution, not an estimate of its spread.
- The Grand carries most of the variance in Classic and Tank. The Grand term $G^2 P(N = 15)$ makes up {{classic.grand_share_e2}} of $E[A^2]$ in Classic and {{tank.grand_share_e2}} in Tank, against {{drift.grand_share_e2}} in Drift. A single seed's mean can therefore sit a standard error or so from the exact figure, and the Classic and Tank means do: {{classic.sim_dist}} and {{tank.sim_dist}} standard errors away. The Classic run saw {{classic.grands_seen}} Grands against {{classic.grands_expected}} expected, and the Tank run saw {{tank.grands_seen}} against {{tank.grands_expected}}. The simulated standard deviations are {{classic.sim_sd}} and {{tank.sim_sd}}, above the exact {{classic.sd_long}} and {{tank.sd_long}}, which fits the extra Grands.
- The engines, the solvers and the Python check all follow one reading of the rules, which is mine. If I read a rule wrongly, they would agree with each other and all be wrong. The checks show that the code does what I meant, and they cannot show that I meant the right thing.
- Free, Wreck and Crew are not built, so this document covers three dives only.
