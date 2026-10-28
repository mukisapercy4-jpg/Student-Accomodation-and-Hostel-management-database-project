"""Roles (Django Groups) and the permission matrix.

Resource -> role -> allowed actions. Actions: read, create, update, delete.
Superusers can do everything. DELETE on bookings and payments is not routed
at all (see views.py), so it is never available to any role.
"""

ADMIN = "Admin"
WARDEN = "Warden"
CARETAKER = "Caretaker"
READ_ONLY = "ReadOnly"
ROLES = (ADMIN, WARDEN, CARETAKER, READ_ONLY)

R, C, U, D = "read", "create", "update", "delete"
ALL = {R, C, U, D}

MATRIX = {
    "staff":       {ADMIN: ALL, WARDEN: {R}, CARETAKER: {R}, READ_ONLY: {R}},
    "students":    {ADMIN: ALL, WARDEN: {R, C, U}, CARETAKER: {R}, READ_ONLY: {R}},
    "hostels":     {ADMIN: ALL, WARDEN: {R}, CARETAKER: {R}, READ_ONLY: {R}},
    "rooms":       {ADMIN: ALL, WARDEN: {R}, CARETAKER: {R}, READ_ONLY: {R}},
    "bookings":    {ADMIN: ALL, WARDEN: {R, C, U}, CARETAKER: {R}, READ_ONLY: {R}},
    "payments":    {ADMIN: ALL, WARDEN: {R, C, U}, READ_ONLY: {R}},
    "maintenance": {ADMIN: ALL, WARDEN: {R, C, U}, CARETAKER: {R, C, U}, READ_ONLY: {R}},
    "visitors":    {ADMIN: ALL, WARDEN: {R, C, U}, CARETAKER: {R, C, U}, READ_ONLY: {R}},
    "dashboard":   {ADMIN: {R}, WARDEN: {R}, CARETAKER: {R}, READ_ONLY: {R}},
}


def user_roles(user):
    if not hasattr(user, "_sahms_roles"):
        user._sahms_roles = set(user.groups.values_list("name", flat=True))
    return user._sahms_roles


def can(user, resource, action):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    rules = MATRIX.get(resource, {})
    return any(action in rules.get(role, ()) for role in user_roles(user))


def is_admin(user):
    return bool(user and user.is_authenticated
                and (user.is_superuser or ADMIN in user_roles(user)))
