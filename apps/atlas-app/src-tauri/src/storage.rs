#[cfg(not(target_os = "android"))]
use keyring::Entry;

#[cfg(target_os = "android")]
use jni::objects::{JClass, JObject, JString, JValue};
#[cfg(target_os = "android")]
use jni::JavaVM;

pub const SERVICE_NAME: &str = "Project Atlas";
pub const REFRESH_TOKEN_ACCOUNT: &str = "refresh-token";

#[cfg(not(target_os = "android"))]
pub fn get_refresh_token() -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_ACCOUNT)
        .map_err(|e| format!("Failed to access credential store: {}", e))?;

    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to retrieve refresh token: {}", e)),
    }
}

#[cfg(not(target_os = "android"))]
pub fn set_refresh_token(token: &str) -> Result<(), String> {
    if token.trim().is_empty() {
        return Err("Cannot persist empty refresh token".to_string());
    }

    let entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_ACCOUNT)
        .map_err(|e| format!("Failed to access credential store: {}", e))?;

    entry
        .set_password(token)
        .map_err(|e| format!("Failed to store refresh token: {}", e))?;

    Ok(())
}

#[cfg(not(target_os = "android"))]
pub fn clear_refresh_token() -> Result<(), String> {
    let entry = Entry::new(SERVICE_NAME, REFRESH_TOKEN_ACCOUNT)
        .map_err(|e| format!("Failed to access credential store: {}", e))?;

    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to clear refresh token: {}", e)),
    }
}

// ============================================================================
// Android Native Storage via Android Keystore & EncryptedSharedPreferences
// ============================================================================

#[cfg(target_os = "android")]
fn with_context_and_env<F, T>(f: F) -> Result<T, String>
where
    F: for<'a> FnOnce(&mut jni::JNIEnv<'a>, &JObject<'_>) -> Result<T, String>,
{
    let android_ctx = ndk_context::android_context();
    let vm_ptr = android_ctx.vm();
    let context_ptr = android_ctx.context();

    if vm_ptr.is_null() || context_ptr.is_null() {
        return Err("Android JNI context or JavaVM pointer is null".to_string());
    }

    let vm = unsafe { JavaVM::from_raw(vm_ptr as _) }
        .map_err(|e| format!("Failed to initialize JavaVM from raw pointer: {}", e))?;

    let mut env = vm
        .attach_current_thread()
        .map_err(|e| format!("Failed to attach thread to JavaVM: {}", e))?;

    let context_obj = unsafe { JObject::from_raw(context_ptr as _) };

    f(&mut env, &context_obj)
}

#[cfg(target_os = "android")]
fn load_helper_class<'local>(
    env: &mut jni::JNIEnv<'local>,
    context: &JObject<'_>,
) -> Result<JClass<'local>, String> {
    // Safely load the app class using the Context's ClassLoader to support background threads
    let class_loader = env
        .call_method(context, "getClassLoader", "()Ljava/lang/ClassLoader;", &[])
        .map_err(|e| format!("Failed to get ClassLoader: {}", e))?
        .l()
        .map_err(|e| format!("Failed to extract ClassLoader object: {}", e))?;

    let class_name_str = env
        .new_string("br.com.atlasinvest.app.SecureStorageHelper")
        .map_err(|e| format!("Failed to create class name JString: {}", e))?;

    let class_obj = env
        .call_method(
            &class_loader,
            "loadClass",
            "(Ljava/lang/String;)Ljava/lang/Class;",
            &[JValue::Object(&class_name_str)],
        )
        .map_err(|e| format!("Failed to load SecureStorageHelper class: {}", e))?
        .l()
        .map_err(|e| format!("Failed to extract Class object: {}", e))?;

    Ok(JClass::from(class_obj))
}

#[cfg(target_os = "android")]
pub fn get_refresh_token() -> Result<Option<String>, String> {
    with_context_and_env(|env, context| {
        let helper_class = load_helper_class(env, context)?;

        let res = env
            .call_static_method(
                helper_class,
                "getRefreshToken",
                "(Landroid/content/Context;)Ljava/lang/String;",
                &[JValue::Object(context)],
            )
            .map_err(|e| format!("JNI call getRefreshToken failed: {}", e))?;

        let obj = res
            .l()
            .map_err(|e| format!("Failed to extract String result: {}", e))?;

        if obj.is_null() {
            return Ok(None);
        }

        let jstr = JString::from(obj);
        let rust_str: String = env
            .get_string(&jstr)
            .map_err(|e| format!("Failed to convert JString: {}", e))?
            .into();

        Ok(Some(rust_str))
    })
}

#[cfg(target_os = "android")]
pub fn set_refresh_token(token: &str) -> Result<(), String> {
    if token.trim().is_empty() {
        return Err("Cannot persist empty refresh token".to_string());
    }

    with_context_and_env(|env, context| {
        let helper_class = load_helper_class(env, context)?;

        let jtoken = env
            .new_string(token)
            .map_err(|e| format!("Failed to create JString: {}", e))?;

        let res = env
            .call_static_method(
                helper_class,
                "setRefreshToken",
                "(Landroid/content/Context;Ljava/lang/String;)Z",
                &[JValue::Object(context), JValue::Object(&jtoken)],
            )
            .map_err(|e| format!("JNI call setRefreshToken failed: {}", e))?;

        let success = res
            .z()
            .map_err(|e| format!("Failed to extract boolean result: {}", e))?;

        if !success {
            return Err("SecureStorageHelper.setRefreshToken returned false".to_string());
        }

        Ok(())
    })
}

#[cfg(target_os = "android")]
pub fn clear_refresh_token() -> Result<(), String> {
    with_context_and_env(|env, context| {
        let helper_class = load_helper_class(env, context)?;

        let res = env
            .call_static_method(
                helper_class,
                "clearRefreshToken",
                "(Landroid/content/Context;)Z",
                &[JValue::Object(context)],
            )
            .map_err(|e| format!("JNI call clearRefreshToken failed: {}", e))?;

        let success = res
            .z()
            .map_err(|e| format!("Failed to extract boolean result: {}", e))?;

        if !success {
            return Err("SecureStorageHelper.clearRefreshToken returned false".to_string());
        }

        Ok(())
    })
}
