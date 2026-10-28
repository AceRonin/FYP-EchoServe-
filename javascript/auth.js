import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyCfK9twZsQmU_Q109JnqT11FmwG5zI3g8w",
  authDomain: "echoserve.firebaseapp.com",
  projectId: "echoserve",
  storageBucket: "echoserve.firebasestorage.app",
  messagingSenderId: "965112489324",
  appId: "1:965112489324:web:c4eb4c2746715c8829ff49",
  measurementId: "G-WJ7CY6H8EX"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

document.addEventListener('DOMContentLoaded', () => {
  const authForm = document.getElementById('auth-form');
  const resetForm = document.getElementById('reset-form');
  const forgotPasswordLink = document.getElementById('forgot-password-link');
  const backToLoginLink = document.getElementById('back-to-login-link');
  const authError = document.getElementById('auth-error');
  const authSuccess = document.getElementById('auth-success');

  function clearMessages() {
    authError.classList.add('hidden');
    authError.innerText = '';
    authSuccess.classList.add('hidden');
    authSuccess.innerText = '';
  }

  function showResetView(showReset) {
    clearMessages();
    if (showReset) {
      authForm.classList.add('hidden');
      resetForm.classList.remove('hidden');
    } else {
      resetForm.classList.add('hidden');
      authForm.classList.remove('hidden');
    }
  }

  forgotPasswordLink.addEventListener('click', (e) => {
    e.preventDefault();
    showResetView(true);
  });

  backToLoginLink.addEventListener('click', (e) => {
    e.preventDefault();
    showResetView(false);
  });

  authForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();

    const email = document.getElementById('auth-email').value;
    const password = document.getElementById('auth-password').value;

    try {
      await signInWithEmailAndPassword(auth, email, password);
      window.location.href = 'index.html';
    } catch (err) {
      console.error('Login failed:', err);
      authError.innerText = err.message || 'Login failed. Please check your email and password.';
      authError.classList.remove('hidden');
    }
  });

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();

    const resetEmail = document.getElementById('reset-email').value;

    try {
      await sendPasswordResetEmail(auth, resetEmail);
      authSuccess.innerText = 'Password reset email sent! Please check your inbox.';
      authSuccess.classList.remove('hidden');
      document.getElementById('reset-email').value = '';
    } catch (err) {
      console.error('Password reset failed:', err);
      authError.innerText = err.message || 'Password reset failed.';
      authError.classList.remove('hidden');
    }
  });
});
