// Gate for every write route. The Edit buttons being hidden in the UI is
// only cosmetic — this is the check that actually enforces admin access.
function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) {
    return next();
  }
  return res.status(401).json({ error: "Authentication required" });
}

module.exports = requireAdmin;
