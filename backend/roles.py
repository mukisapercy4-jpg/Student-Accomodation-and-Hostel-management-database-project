"""Roles (Django Groups) and the permission matrix.

Resource -> role -> allowed actions. Actions: read, create, update, delete.
Superusers can do everything. DELETE on bookings and payments is not routed
at all (see views.py), so it is never available to any role.
"""

ADMIN = "Admin"
WARDEN = "Warden"
CARETAKER = "Caretaker"
READ_ONLY = "ReadOnly"
STUDENT = "Student"
ROLES = (ADMIN, WARDEN, CARETAKER, READ_ONLY, STUDENT)

# API role codes shown to clients (login/me) and the screen each lands on after sign-in.
# MANAGER = Warden, SUPER_ADMIN = Admin, STUDENT = Student (a login linked to a student record
# through accounts.StudentAccount).
ROLE_CODES = {ADMIN: "SUPER_ADMIN", WARDEN: "MANAGER", CARETAKER: "CARETAKER",
              READ_ONLY: "READ_ONLY", STUDENT: "STUDENT"}
ROLE_HOME = {"SUPER_ADMIN": "/admin/dashboard", "MANAGER": "/manager/dashboard",
             "CARETAKER": "/staff/dashboard", "READ_ONLY": "/staff/dashboard",
             "STUDENT": "/student/dashboard"}
_PRIVILEGE = (ADMIN, WARDEN, CARETAKER, READ_ONLY, STUDENT)

R, C, U, D = "read", "create", "update", "delete"
ALL = {R, C, U, D}

MATRIX = {
    "staff":       {ADMIN: ALL, WARDEN: {R}, CARETAKER: {R}, READ_ONLY: {R}},
    "students":    {ADMIN: ALL, WARDEN: {R, C, U}, CARETAKER: {R}, READ_ONLY: {R}},
    "hostels":     {ADMIN: ALL, WARDEN: {R}, CARETAKER: {R}, READ_ONLY: {R}, STUDENT: {R}},
    "rooms":       {ADMIN: ALL, WARDEN: {R}, CARETAKER: {R}, READ_ONLY: {R}, STUDENT: {R}},
    # Students: read and create only, and only their own rows (see student_scope in views.py).
    "bookings":    {ADMIN: ALL, WARDEN: {R, C, U}, CARETAKER: {R}, READ_ONLY: {R}, STUDENT: {R, C}},
    "payments":    {ADMIN: ALL, WARDEN: {R, C, U}, READ_ONLY: {R}, STUDENT: {R}},
    # Starting / confirming a (simulated) Mobile Money payment. Students may do it for their own bookings.
    "momo_payments": {ADMIN: {C}, WARDEN: {C}, STUDENT: {C}},
    "maintenance": {ADMIN: ALL, WARDEN: {R, C, U}, CARETAKER: {R, C, U}, READ_ONLY: {R}},
    "visitors":    {ADMIN: ALL, WARDEN: {R, C, U}, CARETAKER: {R, C, U}, READ_ONLY: {R}},
    "dashboard":   {ADMIN: {R}, WARDEN: {R}, CARETAKER: {R}, READ_ONLY: {R}},
    "audit_logs":  {ADMIN: {R}},
    "booking_history": {ADMIN: {R}},
    "payment_history": {ADMIN: {R}},
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


def role_code(user, signed_in_as=None):
    """Role code for the role the person signed in as, else their most privileged role."""
    if signed_in_as in ROLE_CODES:
        return ROLE_CODES[signed_in_as]
    if user.is_superuser:
        return ROLE_CODES[ADMIN]
    held = user_roles(user)
    for name in _PRIVILEGE:
        if name in held:
            return ROLE_CODES[name]
    return None


def student_only(user):
    """True for a signed-in user whose only role is Student (never staff, never superuser)."""
    return bool(user and user.is_authenticated and not user.is_superuser
                and user_roles(user) == {STUDENT})


def student_id_for(user):
    """The student.student_id linked to this login, or None."""
    from accounts.models import StudentAccount
    if not user or not user.is_authenticated:
        return None
    return (StudentAccount.objects.filter(user=user)
            .values_list("student_id", flat=True).first())


def user_payload(user, signed_in_as=None):
    """What login/me/JWT return: who the person is, their role code, home screen and permissions."""
    roles = sorted(user_roles(user))
    if user.is_superuser:
        roles = list(ROLES)
    code = role_code(user, signed_in_as)
    payload = {
        "username": user.get_username(), "user_id": user.pk, "roles": roles,
        "role": code, "home": ROLE_HOME.get(code, "/"),
        "is_superuser": user.is_superuser,
        "permissions": {res: sorted(a for a in (R, C, U, D) if can(user, res, a))
                        for res in MATRIX},
    }
    if code == ROLE_CODES[STUDENT]:
        from .models import Student
        st = Student.objects.filter(pk=student_id_for(user)).first()
        payload["student"] = ({"student_id": st.pk, "reg_number": st.reg_number,
                               "name": f"{st.first_name} {st.last_name}"} if st else None)
    return payload
