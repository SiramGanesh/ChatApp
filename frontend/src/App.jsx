import './App.css'
import { Show, SignInButton, SignUpButton, UserButton } from '@clerk/react'

function App() {
  return (
    <div>
      <h1>My Chat App</h1>
      <Show when="signed-out">
          <SignInButton mode="modal" />
          <SignUpButton mode="modal">
          <button style={{ marginLeft: '8px' }}>Sign up</button>
          </SignUpButton>
      </Show>
      <Show when="signed-in">
          <UserButton />
      </Show>
    </div>
  )
}

export default App
