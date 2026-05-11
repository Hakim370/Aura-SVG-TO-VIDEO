# Security Spec for Aura SVG Studio

## Data Invariants
1. A user can only access their own profile.
2. Only an admin can change user roles or block statuses.
3. An export record must link to the authenticated user's ID.
4. Export counts must be updated incrementally (conceptually, though rules just verify existence).

## The Dirty Dozen Payloads (Targeting PERMISSION_DENIED)

1. **Identity Spoofing (User Profile)**: User A tries to overwrite User B's profile.
2. **Privilege Escalation**: User A tries to set their own `role` to `admin`.
3. **Block Bypass**: A blocked user tries to write a new export.
4. **ID Poisoning**: Creating a user with a 2KB string as ID.
5. **Shadow Fields**: Adding `isVerified: true` to a user profile create if it's not in the schema.
6. **Orphaned Export**: Creating an export with a `userId` that doesn't match the requester's UID.
7. **Out-of-Order Status**: Updating a terminal export status.
8. **Malicious Export Size**: Setting `fileSize` to a negative number or a string.
9. **Admin Spoofing**: User A trying to delete User B's exports.
10. **Unverified Read**: Non-owner trying to 'get' a user's private PII (email).
11. **Blanket Query**: Trying to list ALL users as a standard user.
12. **Future Timestamp**: Setting `createdAt` to a future date.
