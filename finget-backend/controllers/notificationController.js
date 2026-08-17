const Notification = require("../models/Notification");
const { fromPaise } = require("../utils/money");

/**
 * In-app notifications.
 *
 * Reads are scoped to `req.user` on every query without exception — a
 * notification is addressed to one person, and there is no admin view, no
 * group view, and no id-based lookup that skips the ownership filter.
 */

/** Enough to fill the panel and its "older" scroll, without paging machinery. */
const PAGE_SIZE = 50;

function serialize(notification) {
  return {
    _id: notification._id,
    kind: notification.kind,
    title: notification.title,
    body: notification.body,
    href: notification.href || null,
    groupId: notification.groupId ? String(notification.groupId) : null,
    amount: notification.amountPaise != null ? fromPaise(notification.amountPaise) : null,
    amountPaise: notification.amountPaise ?? null,
    payIntent: notification.payIntent || null,
    read: Boolean(notification.readAt),
    createdAt: notification.createdAt,
  };
}

exports.listNotifications = async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      Notification.find({ userId: req.user }).sort({ createdAt: -1 }).limit(PAGE_SIZE).lean(),
      Notification.countDocuments({ userId: req.user, readAt: { $exists: false } }),
    ]);

    res.json({ notifications: notifications.map(serialize), unreadCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * `POST /api/notifications/read` — mark one, several, or everything.
 *
 * `$exists: false` in the filter keeps this idempotent: re-marking something
 * already read leaves its original timestamp alone rather than resetting it.
 */
exports.markRead = async (req, res) => {
  try {
    const filter = { userId: req.user, readAt: { $exists: false } };

    if (Array.isArray(req.body.ids) && req.body.ids.length) {
      filter._id = { $in: req.body.ids };
    }

    const result = await Notification.updateMany(filter, { $set: { readAt: new Date() } });
    res.json({ marked: result.modifiedCount ?? 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
