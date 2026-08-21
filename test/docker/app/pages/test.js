import { useSession } from 'isc-auth/client'

export default function TestPage() {
  const [session, loading] = useSession()

  return (
    <div id='iscauth-test-page'>
      <h1>ISCAuth Test Page</h1>
      {session && <p id="iscauth-signed-in">Signed in</p>}
      {!session && !loading && <p id="iscauth-signed-out">Signed out</p>}
    </div>
  )
}
