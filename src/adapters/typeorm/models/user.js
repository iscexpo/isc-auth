export class User {
  constructor (name, email, image, emailVerified, passwordHash, phone, phoneVerified) {
    if (name) { this.name = name }
    if (email) { this.email = email }
    if (image) { this.image = image }
    if (emailVerified) {
      const currentDate = new Date()
      this.emailVerified = currentDate
    }
    // Hashed with src/lib/password.js (never store plaintext passwords)
    if (passwordHash) { this.passwordHash = passwordHash }
    // E.164 formatted phone number (used for phone OTP sign in)
    if (phone) { this.phone = phone }
    if (phoneVerified) {
      const currentDate = new Date()
      this.phoneVerified = currentDate
    }
  }
}

export const UserSchema = {
  name: 'User',
  target: User,
  columns: {
    id: {
      // This property has `objectId: true` instead of `type: int` in MongoDB
      primary: true,
      type: 'int',
      generated: true
    },
    name: {
      type: 'varchar',
      nullable: true
    },
    email: {
      // This is inherited from the one in the OAuth provider profile on
      // initial sign in, if one is specified in that profile.
      type: 'varchar',
      unique: true,
      nullable: true
    },
    emailVerified: {
      // Contains a timestamp of the last time an action was performed that
      // confirmed this email address was active and used by the user (e.g.
      // when an email sign in link is clicked on and verified). Is null
      // if the email address specified has never been verified.
      type: 'timestamp',
      nullable: true
    },
    image: {
      // A URL that points to an avatar to use for the user.
      // This is inherited from the one in the OAuth provider profile on
      // initial sign in, if one is specified in that profile.
      type: 'varchar',
      nullable: true
    },
    passwordHash: {
      // scrypt hash in self-describing format (see src/lib/password.js).
      // Null unless the user signed up with email + password.
      // Uniqueness is enforced at application level; no DB constraint so that
      // multiple NULLs stay valid on all supported databases (incl. MSSQL).
      type: 'varchar',
      nullable: true
    },
    phone: {
      // E.164 formatted phone number. Uniqueness is enforced at application
      // level during phone verification (see PLAN.md Phase 2).
      type: 'varchar',
      nullable: true
    },
    phoneVerified: {
      // Timestamp of when the phone number was last confirmed via OTP.
      // Is null if the phone number has never been verified.
      type: 'timestamp',
      nullable: true
    },
    createdAt: {
      type: 'timestamp',
      createDate: true
    },
    updatedAt: {
      type: 'timestamp',
      updateDate: true
    }
  }
}
