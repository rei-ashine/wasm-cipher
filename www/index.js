import {encrypt, decrypt} from "../pkg/wasm_cipher.js";

let wasmLoaded = true; // WASM auto-initializes in newer versions
let wasmEncrypt = encrypt;
let wasmDecrypt = decrypt;

console.log("WASM module loaded successfully");

const q = (query) => {
    return document.querySelector(query);
}

function showError(message) {
    const outputBox = q("#outbox");
    outputBox.value = `Error: ${message}`;
    outputBox.style.color = "#dc3545";
    setTimeout(() => {
        outputBox.style.color = "";
    }, 3000);
}

function enc_on() {
    if (!wasmLoaded) {
        showError("Encryption module not loaded yet");
        return;
    }
    
    const password = q("#password").value;
    const input = q("#inbox").value;
    
    if (!password.trim()) {
        showError("Please enter a password");
        return;
    }
    
    if (!input.trim()) {
        showError("Please enter text to encrypt");
        return;
    }
    
    try {
        const result = wasmEncrypt(password, input);
        q("#outbox").value = result;
        q("#outbox").style.color = "";
    } catch (err) {
        console.error("Encryption error:", err);
        showError(err.message || "Encryption failed");
    }
}

function swap_on() {
    const inbox = q("#inbox");
    const outbox = q("#outbox");
    inbox.value = outbox.value;
    outbox.value = "";
    resizeTextarea(inbox);
    resizeTextarea(outbox);
}

function dec_on() {
    if (!wasmLoaded) {
        showError("Decryption module not loaded yet");
        return;
    }
    
    const password = q("#password").value;
    const input = q("#inbox").value;
    
    if (!password.trim()) {
        showError("Please enter a password");
        return;
    }
    
    if (!input.trim()) {
        showError("Please enter text to decrypt");
        return;
    }
    
    try {
        const result = wasmDecrypt(password, input);
        q("#outbox").value = result;
        q("#outbox").style.color = "";
    } catch (err) {
        console.error("Decryption error:", err);
        showError(err.message || "Decryption failed - check password and input");
    }
}

function resizeTextarea(element) {
    element.style.height = 'auto';
    element.style.height = element.scrollHeight + 'px';
}

function resizer(event) {
    resizeTextarea(event.target);
}

function resize_textarea() {
    const box_in = q("#inbox");
    const box_out = q("#outbox");
    
    box_in.addEventListener("input", resizer);
    box_in.addEventListener("keydown", resizer);
    box_out.addEventListener("input", resizer);
    box_out.addEventListener("keydown", resizer);
}

async function copyToClipboard() {
    const output = q("#outbox").value;
    
    if (!output.trim()) {
        showError("Nothing to copy");
        return;
    }
    
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(output);
            
            const copyIcon = q("#copy-icon");
            if (copyIcon) {
                const originalHTML = copyIcon.innerHTML;
                copyIcon.innerHTML = `<path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>`;
                copyIcon.style.color = "#198754";
                
                setTimeout(() => {
                    copyIcon.innerHTML = originalHTML;
                    copyIcon.style.color = "#8c8c8c";
                }, 2000);
            }
        } else {
            // Fallback for older browsers
            q("#outbox").select();
            document.execCommand('copy');
            alert("Copied to clipboard!");
        }
    } catch (err) {
        console.error("Copy failed:", err);
        showError("Failed to copy to clipboard");
    }
}

const main = () => {
    window.addEventListener("load", () => {
        resizeTextarea(q("#inbox"));
        resizeTextarea(q("#outbox"));
    });

    resize_textarea();

    // Event delegation for button clicks
    document.addEventListener("click", e => {
        const id = e.target.getAttribute("id");
        switch(id) {
            case "encrypt":
                enc_on();
                break;
            case "decrypt":
                dec_on();
                break;
            case "swap":
                swap_on();
                break;
            case "outbox":
                copyToClipboard();
                break;
        }
    });
    
    // Handle Enter key in password field
    q("#password").addEventListener("keydown", e => {
        if (e.key === "Enter") {
            e.preventDefault();
            if (e.shiftKey) {
                dec_on();
            } else {
                enc_on();
            }
        }
    });
};

main();
