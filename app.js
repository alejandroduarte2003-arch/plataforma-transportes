import { supabase } from "./config.js";

// Elementos
const loginForm = document.getElementById("loginForm");
const loginButton = document.getElementById("loginButton");
const buttonText = document.getElementById("buttonText");
const loginMessage = document.getElementById("loginMessage");

// Mostrar mensajes
function showMessage(message, type) {
    loginMessage.textContent = message;
    loginMessage.className = "login-message " + type;
}

// Inicio de sesión
loginForm.addEventListener("submit", async function(event) {

    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginButton.disabled = true;
    buttonText.textContent = "Verificando acceso...";

    loginMessage.className = "login-message";

    try {

        const { data, error } = await supabase.auth.signInWithPassword({
            email: email,
            password: password
        });

        if (error) {
            throw error;
        }

        showMessage(
            "Autenticación correcta. Próximamente ingresaremos al dashboard.",
            "success"
        );

        console.log("Sesión iniciada correctamente.");

    } catch (error) {

        showMessage(
            "No fue posible iniciar sesión. Verifica tus credenciales.",
            "error"
        );

        console.error("Error de autenticación:", error.message);

    } finally {

        loginButton.disabled = false;
        buttonText.textContent = "Ingresar a la plataforma";

    }

});