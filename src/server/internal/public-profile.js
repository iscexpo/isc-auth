/** Strip private/internal fields before returning a user to the client */
export default function publicProfile (user) {
  return {
    id: user?.id != null ? `${user.id}` : null,
    name: user?.name ?? null,
    email: user?.email ?? null,
    image: user?.image ?? null,
    phone: user?.phone ?? null,
    phoneVerified: !!user?.phoneVerified
  }
}
