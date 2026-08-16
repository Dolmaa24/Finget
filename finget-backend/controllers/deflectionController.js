const {
  openHold,
  resolveHold,
  awaitingDecision,
  ledgerFor,
  VaultError,
  VAULT_HOURS,
  GRACE_HOURS,
} = require("../services/vaultService");
const {
  resolveScope,
  affordabilityForScope,
  handleScopeError,
} = require("../services/scopeResolver");
const { translate } = require("../services/goalCurrencyService");
const { fromPaise, toPaise } = require("../utils/money");

function handleVaultError(err, res) {
  if (err instanceof VaultError) return res.status(err.status).json({ msg: err.msg });
  return handleScopeError(err, res);
}

/** Paise from either an explicit `amountPaise` or a rupee convenience field. */
function readAmountPaise(body) {
  if (body.amountPaise !== undefined) {
    if (!Number.isInteger(body.amountPaise)) {
      throw new VaultError(400, "amountPaise must be an integer number of paise");
    }
    return body.amountPaise;
  }
  if (body.amount !== undefined) {
    const rupees = Number(body.amount);
    if (!Number.isFinite(rupees)) throw new VaultError(400, "amount must be a number");
    return toPaise(rupees);
  }
  throw new VaultError(400, "amountPaise is required");
}

/**
 * `POST /api/deflections` — "I want this."
 *
 * Ring-fences the amount immediately. The response carries safe-to-spend both
 * before and after so the client can animate the number down rather than just
 * showing a smaller one: the point of the feature is that the cost is *felt*
 * at the moment of wanting.
 */
exports.create = async (req, res) => {
  try {
    const { label, sourceUrl, context, groupId } = req.body;
    const amountPaise = readAmountPaise(req.body);

    const scope = await resolveScope({ userId: req.user, context, groupId });
    const before = affordabilityForScope(scope);

    // Snapshot what this meant right now. Recomputed later it would drift, and
    // the ledger's whole value is saying what it cost you *at the time*.
    const translation = await translate(scope, amountPaise);

    const deflection = await openHold(scope, req.user, {
      label,
      amountPaise,
      sourceUrl,
      translationSnapshot: {
        headline: translation.headline,
        headlineKind: translation.headlineKind,
        goalName: translation.goalImpacts[0]?.name,
        daysOfSafeSpend: translation.daysOfSafeSpend ?? undefined,
        riskAfter: translation.riskAfter,
      },
    });

    // Re-resolve so `heldPaise` includes the hold we just opened.
    const after = affordabilityForScope(
      await resolveScope({ userId: req.user, context, groupId })
    );

    if (scope.isGroup) {
      const io = req.app.get("io");
      // Attributed, per the group-holds rule: the number moved for everyone,
      // so everyone gets to see whose decision moved it.
      if (io) {
        io.to(`group:${scope.group._id}`).emit("deflection:opened", {
          groupId: String(scope.group._id),
          label: deflection.label,
          amount: fromPaise(deflection.amountPaise),
        });
      }
    }

    res.status(201).json({
      deflection,
      vaultHours: VAULT_HOURS,
      graceHours: GRACE_HOURS,
      safeToSpend: {
        before: { remaining: before.remaining, safeDaily: before.safeDaily, risk: before.risk },
        after: { remaining: after.remaining, safeDaily: after.safeDaily, risk: after.risk },
      },
    });
  } catch (err) {
    handleVaultError(err, res);
  }
};

/**
 * `POST /api/deflections/:id/resolve` — bought, or walked away.
 *
 * Both answers are fine. The response says nothing different in tone for
 * "bought"; the ledger simply does not count it.
 */
exports.resolve = async (req, res) => {
  try {
    const { decision, context, groupId } = req.body;
    const scope = await resolveScope({ userId: req.user, context, groupId });

    const deflection = await resolveHold(scope, req.user, req.params.id, decision);

    const after = affordabilityForScope(
      await resolveScope({ userId: req.user, context, groupId })
    );

    if (scope.isGroup) {
      const io = req.app.get("io");
      if (io) {
        io.to(`group:${scope.group._id}`).emit("deflection:resolved", {
          groupId: String(scope.group._id),
          label: deflection.label,
          decision: deflection.state,
        });
      }
    }

    res.json({
      deflection,
      released: decision === "deflected",
      safeToSpend: { remaining: after.remaining, safeDaily: after.safeDaily, risk: after.risk },
    });
  } catch (err) {
    handleVaultError(err, res);
  }
};

/**
 * `GET /api/deflections/ledger` — money kept.
 *
 * Expressed in goal currency, because "₹12,400" is a number and "that is the
 * Goa trip, funded" is a reason to do it again.
 */
exports.ledger = async (req, res) => {
  try {
    const scope = await resolveScope({
      userId: req.user,
      context: req.query.context,
      groupId: req.query.groupId,
    });

    const ledger = await ledgerFor(scope, req.user);

    /**
     * Translate the quarter's total into goals. Only when there is something
     * to translate — running the translator on zero would produce "0 days of
     * your Goa trip", which is a sentence about failure.
     */
    let headline = null;
    if (ledger.quarterPaise > 0) {
      const translation = await translate(scope, ledger.quarterPaise);
      headline = {
        text: translation.headline,
        kind: translation.headlineKind,
        goalName: translation.goalImpacts[0]?.name || null,
      };
    }

    res.json({
      scope: scope.isGroup ? "group" : "user",
      month: fromPaise(ledger.monthPaise),
      monthPaise: ledger.monthPaise,
      quarter: fromPaise(ledger.quarterPaise),
      quarterPaise: ledger.quarterPaise,
      allTime: fromPaise(ledger.allTimePaise),
      allTimePaise: ledger.allTimePaise,
      count: ledger.count,
      headline,
      held: fromPaise(ledger.heldPaise),
      heldPaise: ledger.heldPaise,
      holds: ledger.holds,
      deflections: ledger.deflections,
    });
  } catch (err) {
    handleVaultError(err, res);
  }
};

/** `GET /api/deflections/pending` — holds whose 48 hours are up. */
exports.pending = async (req, res) => {
  try {
    const scope = await resolveScope({
      userId: req.user,
      context: req.query.context,
      groupId: req.query.groupId,
    });

    res.json(await awaitingDecision(scope, req.user));
  } catch (err) {
    handleVaultError(err, res);
  }
};
