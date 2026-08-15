import { redirect } from 'next/navigation';

/** PLAN and LOG merged into /train — they were one flow, not two features. */
export default function Redirect() {
  redirect('/train');
}
