import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

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
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('register-form');
  const registerError = document.getElementById('register-error');
  const registerSuccess = document.getElementById('register-success');

  function clearMessages() {
    registerError.classList.add('hidden');
    registerError.innerText = '';
    registerSuccess.classList.add('hidden');
    registerSuccess.innerText = '';
  }

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearMessages();

    const companyName = document.getElementById('company-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;

    try {
      if (!companyName) {
        throw new Error('Please enter a company name.');
      }

      if (!email || !password) {
        throw new Error('Please enter both email and password.');
      }

      console.log('Attempting to create account for:', email);
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      console.log('Auth account created:', userCred.user.uid);
      const uid = userCred.user.uid;
      const companyId = 'comp_' + uid;

      await setDoc(doc(db, 'companies', companyId), {
        name: companyName,
        createdAt: serverTimestamp(),
        ownerId: uid
      });

      await setDoc(doc(db, 'companies', companyId, 'users', uid), {
        email,
        role: 'admin'
      });

      await setDoc(doc(db, 'user_index', uid), { companyId });

      registerSuccess.innerText = 'Account created successfully! Redirecting...';
      registerSuccess.classList.remove('hidden');

      window.location.href = 'index.html';
    } catch (err) {
      console.error('Registration failed:', err);
      if (err.code === 'auth/email-already-in-use') {
        registerError.innerText = 'This email is already registered. Please sign in or use another email.';
      } else {
        registerError.innerText = err.message || 'Registration failed. Check Firebase rules and authentication setup.';
      }
      registerError.classList.remove('hidden');
    }
  });
});
