# 🏆 Guía Completa — Polla Mundial 2026
## Instrucciones paso a paso para publicar la app (sin experiencia técnica)

---

## ¿Qué necesitas instalar primero?

Antes de empezar, necesitas 3 herramientas gratuitas en tu computador:

1. **Node.js** — el motor que corre el código
2. **Git** — para subir el código a internet
3. **VS Code** — para editar el código (opcional pero recomendado)

---

## PASO 1 — Instala Node.js

1. Ve a **https://nodejs.org**
2. Descarga la versión que dice **"LTS"** (la recomendada)
3. Instálala con todas las opciones por defecto
4. Para verificar que funcionó, abre la Terminal (Mac) o CMD (Windows) y escribe:
   ```
   node --version
   ```
   Debe salir algo como `v20.x.x`

---

## PASO 2 — Instala Git

1. Ve a **https://git-scm.com/downloads**
2. Descarga e instala para tu sistema operativo
3. Verifica con:
   ```
   git --version
   ```

---

## PASO 3 — Crea el proyecto en tu computador

1. Crea una carpeta en tu computador llamada `mundial2026`
2. Copia todos los archivos que te di dentro de esa carpeta, **respetando exactamente la estructura de carpetas**:

```
mundial2026/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── globals.css
│   ├── dashboard/
│   │   └── page.tsx
│   ├── picks/
│   │   └── page.tsx
│   ├── mypicks/
│   │   └── page.tsx
│   ├── standings/
│   │   └── page.tsx
│   ├── admin/
│   │   └── page.tsx
│   ├── login/
│   │   └── page.tsx
│   └── register/
│       └── page.tsx
├── lib/
│   ├── firebase.ts
│   └── scoring.ts
├── .env.local.example
├── .gitignore
├── next.config.js
├── package.json
└── tsconfig.json
```

3. Abre una terminal **dentro de esa carpeta** y ejecuta:
   ```
   npm install
   ```
   Esto descarga todas las dependencias. Puede tardar 1-2 minutos.

---

## PASO 4 — Configura Firebase (base de datos gratuita)

### 4.1 — Crea tu proyecto Firebase

1. Ve a **https://console.firebase.google.com**
2. Inicia sesión con tu cuenta de Google
3. Haz clic en **"Agregar proyecto"**
4. Nombre del proyecto: `mundial2026` (o el que quieras)
5. Desactiva Google Analytics (no lo necesitas) → Continuar
6. Espera a que se cree el proyecto

### 4.2 — Activa Authentication (login de usuarios)

1. En el menú izquierdo haz clic en **"Authentication"**
2. Haz clic en **"Comenzar"**
3. Haz clic en **"Correo electrónico/contraseña"**
4. Activa la primera opción (Correo electrónico/contraseña) → Guardar

### 4.3 — Activa Firestore (base de datos)

1. En el menú izquierdo haz clic en **"Firestore Database"**
2. Haz clic en **"Crear base de datos"**
3. Selecciona **"Comenzar en modo de prueba"** → Siguiente
4. Elige la ubicación más cercana (ej: `us-central` para Colombia) → Listo

### 4.4 — Configura las reglas de seguridad de Firestore

1. En Firestore, haz clic en la pestaña **"Reglas"**
2. Reemplaza todo el contenido con esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Usuarios: pueden leer todos, solo escribir el suyo
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }
    
    // Partidos: solo lectura para usuarios, escritura solo admin
    match /matches/{matchId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    // Apuestas: cada usuario gestiona las suyas
    match /picks/{pickId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null && 
        (resource.data.userId == request.auth.uid || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
    }
    
    // Picks de grupos
    match /groupPicks/{pickId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
      allow update: if request.auth != null && 
        (resource.data.userId == request.auth.uid || 
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);
    }
    
    // Clasificaciones de grupos: solo admin escribe
    match /groupStandings/{standingId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
    
    // Configuración del torneo: solo admin escribe
    match /settings/{settingId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && 
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true;
    }
  }
}
```

3. Haz clic en **"Publicar"**

### 4.5 — Obtén las credenciales de Firebase

1. En el menú izquierdo, haz clic en el ícono de engranaje ⚙ → **"Configuración del proyecto"**
2. En la sección **"Tus aplicaciones"**, haz clic en el ícono `</>`  (web)
3. Nombre de la app: `mundial2026-web` → Registrar app
4. Verás un bloque de código así:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSyXXXXXXX...",
  authDomain: "tu-proyecto.firebaseapp.com",
  projectId: "tu-proyecto",
  storageBucket: "tu-proyecto.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef..."
};
```

5. **Copia estos valores** — los necesitas en el siguiente paso

### 4.6 — Crea el archivo .env.local

1. En la carpeta `mundial2026`, crea un archivo llamado exactamente `.env.local`
   (sin el `.example` al final)
2. Pega esto y reemplaza con tus valores reales:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyXXXXXXXXXXXXXXXXXXX
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=tu-proyecto.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=tu-proyecto
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=tu-proyecto.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abcdef1234567890
```

---

## PASO 5 — Prueba la app localmente

En la terminal, dentro de la carpeta del proyecto:

```
npm run dev
```

Abre tu navegador en **http://localhost:3000**

Si ves la pantalla de login, ¡todo está funcionando! 🎉

---

## PASO 6 — Hazte administrador

1. Regístrate en la app como un usuario normal (con tu correo)
2. Ve a **Firebase Console → Firestore Database**
3. Haz clic en la colección **"users"**
4. Busca tu documento (tiene tu nombre de usuario)
5. Haz clic en el documento → Editar → Agrega un campo:
   - Nombre: `isAdmin`
   - Tipo: `boolean`
   - Valor: `true`
6. Guarda los cambios
7. Recarga la app — ahora verás el menú "⚙ Admin"

---

## PASO 7 — Publica en Vercel (gratis)

### 7.1 — Sube el código a GitHub

1. Ve a **https://github.com** y crea una cuenta si no tienes
2. Haz clic en **"New repository"**
   - Nombre: `mundial2026`
   - Privado (recomendado) ✓
   - Create repository
3. En la terminal (dentro de tu carpeta del proyecto):

```bash
git init
git add .
git commit -m "Primera versión"
git branch -M main
git remote add origin https://github.com/TU_USUARIO/mundial2026.git
git push -u origin main
```

Reemplaza `TU_USUARIO` con tu usuario de GitHub.

### 7.2 — Despliega en Vercel

1. Ve a **https://vercel.com** → Crea cuenta con tu GitHub
2. Haz clic en **"Add New Project"**
3. Busca tu repositorio `mundial2026` → Import
4. En la sección **"Environment Variables"**, agrega todas las variables de tu `.env.local`:
   - `NEXT_PUBLIC_FIREBASE_API_KEY` = tu valor
   - `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` = tu valor
   - `NEXT_PUBLIC_FIREBASE_PROJECT_ID` = tu valor
   - `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` = tu valor
   - `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` = tu valor
   - `NEXT_PUBLIC_FIREBASE_APP_ID` = tu valor
5. Haz clic en **"Deploy"**
6. Espera ~2 minutos... ¡Listo!

Vercel te dará una URL como `mundial2026-xxxx.vercel.app` — ¡esa es tu app!

### 7.3 — Autoriza el dominio en Firebase

1. Ve a Firebase → Authentication → Settings → **"Authorized domains"**
2. Haz clic en **"Add domain"**
3. Agrega tu dominio de Vercel: `mundial2026-xxxx.vercel.app`

---

## PASO 8 — Cómo usar la app como administrador

### Flujo normal del torneo:

1. **Antes de cada jornada:** Ve a Admin → "Crear Partidos" y crea los partidos del día con fecha y hora
2. **Antes de que empiece cada partido:** Ve a Admin → "Ingresar Resultados" → Haz clic en "🔒 Cerrar apuestas" para ese partido
3. **Cuando termine el partido:** En la misma pantalla, ingresa el marcador real y haz clic en "✓ Guardar" — los puntos se calculan automáticamente
4. **Al terminar la fase de grupos:** Ve a Admin → "Clasificación Grupos" e ingresa quién quedó primero y segundo en cada grupo
5. **Al terminar el torneo:** Ve a Admin → "Campeón / Goleador" e ingresa los resultados finales

---

## PASO 9 — Cómo actualizar la app

Cada vez que necesites hacer cambios al código:

```bash
git add .
git commit -m "Descripción del cambio"
git push
```

Vercel detectará el cambio automáticamente y republicará la app en ~1 minuto.

---

## Sistema de puntos — Resumen

| Acierto | Puntos |
|---------|--------|
| Marcador exacto | 5 pts |
| Resultado correcto (ganador/empate) | 3 pts |
| Gol local acertado | 1 pt |
| Gol visitante acertado | 1 pt |
| 1° lugar de grupo | 1 pt |
| 2° lugar de grupo | 1 pt |
| 3° lugar que pasa a octavos | 1 pt |
| Campeón del Mundial | 15 pts |
| Goleador del Torneo | 10 pts |

**Fecha límite para Campeón y Goleador:** 9 de junio de 2026

---

## ❓ Preguntas frecuentes

**¿Cuánto cuesta?**
Todo es gratuito. Firebase tiene un nivel gratuito (Spark) que aguanta perfectamente para una polla entre amigos. Vercel también es gratuito para proyectos personales.

**¿Cuántos amigos pueden usar la app?**
El plan gratuito de Firebase soporta hasta 50,000 lecturas y 20,000 escrituras por día, lo que es más que suficiente para 50-100 personas.

**¿Qué pasa si me equivoco con un resultado?**
Puedes corregirlo desde Admin → Ingresar Resultados → "✏ Corregir". Los puntos se recalculan automáticamente.

**¿Puedo poner el nombre que quiero en la app?**
Sí, cambia "MUNDIAL 2026" y "Polla Mundial 2026" en los archivos de código.

**El partido ya empezó pero olvidé cerrarlo, ¿qué hago?**
Ciérralo manualmente desde el panel admin. Las apuestas enviadas antes del cierre quedan guardadas.

---

## 🆘 Solución de problemas comunes

**Error: "Firebase: Error (auth/invalid-api-key)"**
→ Revisa que las variables en `.env.local` sean correctas y que no tengan espacios extra.

**Error: "permission-denied" en Firestore**
→ Revisa las reglas de seguridad de Firestore (Paso 4.4).

**La app no carga en Vercel**
→ Ve a tu proyecto en Vercel → Settings → Environment Variables y verifica que estén todas.

**No aparece el menú Admin**
→ Verifica que el campo `isAdmin: true` esté en tu documento de usuario en Firestore.

---

*Cualquier duda, consulta la documentación oficial:*
- *Firebase:* https://firebase.google.com/docs
- *Next.js:* https://nextjs.org/docs
- *Vercel:* https://vercel.com/docs
