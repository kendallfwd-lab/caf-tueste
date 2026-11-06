import Link from "next/link";
import { getChatGPTUser } from "../chatgpt-auth";
import { getAdmin } from "../../lib/admin-auth";
import AdminConsole from "../../components/admin-console";
import "../admin.css";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const user = await getChatGPTUser();
  if (!user) return <main className="admin-gate"><span>TUESTE / OPERACIONES</span><h1>Tu operación, en orden.</h1><p>Inicia sesión desde el acceso privado de Tueste para entrar al panel.</p><Link href="/">Volver a la tienda</Link></main>;
  if (!await getAdmin()) return <main className="admin-gate"><span>TUESTE / ACCESO RESTRINGIDO</span><h1>Este espacio es del equipo.</h1><p>Tu cuenta no tiene permisos de administración. Solicita acceso al responsable de Tueste.</p><Link href="/">Volver a la tienda</Link></main>;
  return <AdminConsole />;
}
