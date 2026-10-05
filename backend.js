// Firebase SDK 모듈 임포트
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, updateDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// TODO: 본인의 Firebase 프로젝트 설정값으로 교체해야 합니다.
const firebaseConfig = {
    apiKey: "AIzaSyC49b-msgDEf_vorf1gmu3dJ_oKDPUrh5k",
    authDomain: "filemover-7cc9f.firebaseapp.com",
    projectId: "filemover-7cc9f",
    storageBucket: "filemover-7cc9f.firebasestorage.app",
    messagingSenderId: "Y857800312653",
    appId: "Y1:857800312653:web:3af4530ef8722cab695904",
    measurementId: "G-ZN7EWK4NB8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

export { auth, db, provider, signInWithPopup, onAuthStateChanged, signOut, collection, addDoc, getDocs, query, where, orderBy, deleteDoc, doc, updateDoc, setDoc, getDoc };

// Cloudinary 설정 관리 함수 (로컬스토리지 + Firestore 연동)
export function getCloudinaryConfig() {
    try {
        const saved = localStorage.getItem('cloudinary_config');
        if (saved) {
            const parsed = JSON.parse(saved);
            return {
                cloudName: (parsed.cloudName || '').trim(),
                uploadPreset: (parsed.uploadPreset || '').trim(),
                apiKey: (parsed.apiKey || '').trim(),
                apiSecret: (parsed.apiSecret || '').trim()
            };
        }
    } catch (e) {
        console.error('Cloudinary 설정 로드 실패:', e);
    }
    return {
        cloudName: '',
        uploadPreset: '',
        apiKey: '',
        apiSecret: ''
    };
}

export async function saveCloudinaryConfig(config, uid = null) {
    const cleanConfig = {
        cloudName: (config.cloudName || '').trim(),
        uploadPreset: (config.uploadPreset || '').trim(),
        apiKey: (config.apiKey || '').trim(),
        apiSecret: (config.apiSecret || '').trim()
    };
    try {
        localStorage.setItem('cloudinary_config', JSON.stringify(cleanConfig));
    } catch (e) {
        console.error('Cloudinary 로컬 저장 실패:', e);
    }

    if (uid && db) {
        try {
            await setDoc(doc(db, 'user_settings', uid), { cloudinary: cleanConfig }, { merge: true });
        } catch (e) {
            console.warn('Firestore 설정 동기화 실패 (로컬 저장은 유지됨):', e);
        }
    }
}

export async function syncCloudinaryConfigFromFirestore(uid) {
    if (!uid || !db) return getCloudinaryConfig();
    try {
        const docRef = doc(db, 'user_settings', uid);
        const docSnap = await getDoc(docRef);
        const localConfig = getCloudinaryConfig();
        const hasLocalConfig = Boolean(localConfig.cloudName && localConfig.uploadPreset);

        if (docSnap.exists() && docSnap.data().cloudinary) {
            const remoteConfig = docSnap.data().cloudinary;
            const hasRemoteConfig = Boolean(remoteConfig.cloudName && remoteConfig.uploadPreset);

            if (hasRemoteConfig) {
                const merged = {
                    cloudName: (remoteConfig.cloudName || localConfig.cloudName || '').trim(),
                    uploadPreset: (remoteConfig.uploadPreset || localConfig.uploadPreset || '').trim(),
                    apiKey: (remoteConfig.apiKey || localConfig.apiKey || '').trim(),
                    apiSecret: (remoteConfig.apiSecret || localConfig.apiSecret || '').trim()
                };
                localStorage.setItem('cloudinary_config', JSON.stringify(merged));
                return merged;
            } else if (hasLocalConfig) {
                // 원격에 설정이 없고 로컬에 유효한 설정이 있는 경우 원격으로 업로드 동기화
                await setDoc(docRef, { cloudinary: localConfig }, { merge: true });
                return localConfig;
            }
        } else if (hasLocalConfig) {
            // 원격 문서가 없고 로컬에 설정이 있는 경우 원격에 자동 저장
            await setDoc(docRef, { cloudinary: localConfig }, { merge: true });
            return localConfig;
        }
    } catch (e) {
        console.warn('Firestore 설정 동기화 실패 (로컬 설정 사용):', e);
    }
    return getCloudinaryConfig();
}

export async function sha1(str) {
    const buffer = new TextEncoder("utf-8").encode(str);
    const digest = await crypto.subtle.digest("SHA-1", buffer);
    return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('');
}

export async function deleteCloudinaryFile(publicId, resourceType = 'image') {
    const config = getCloudinaryConfig();
    const { cloudName, apiKey, apiSecret } = config;

    if (!cloudName || !apiKey || !apiSecret) {
        console.warn("Cloudinary 설정(Cloud Name, API Key, API Secret)이 설정되지 않아 삭제할 수 없습니다.");
        return;
    }

    const timestamp = Math.floor(Date.now() / 1000);
    const signatureString = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;
    const signature = await sha1(signatureString);

    const formData = new FormData();
    formData.append('public_id', publicId);
    formData.append('api_key', apiKey);
    formData.append('timestamp', timestamp);
    formData.append('signature', signature);
    const url = `https://api.cloudinary.com/v1_1/${cloudName}/${resourceType}/destroy`;

    try {
        await fetch(url, { method: 'POST', body: formData });
    } catch (error) {
        console.error("Cloudinary 삭제 실패:", error);
    }
}
