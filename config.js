// =====================================
// CONFIGURACIÓN DE SUPABASE
// =====================================

import { createClient } from
"https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = "https://ulhqfxhmmzvzmqvjqqao.supabase.co/rest/v1/";

const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_MOl8oSHyrhMmxLd5na0h4w_64e4mQXe";

// Crear conexión
export const supabase = createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY
);