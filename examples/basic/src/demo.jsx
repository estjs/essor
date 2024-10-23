import { onDestroy ,onMount} from 'essor';

export default function Demo(){

  let $value = "Example Custom Essor Component";

  onMount(() => {
    console.log('mount');
  });

  onDestroy(() => {
    console.log('destroy');
  });
  return (
    <div class="text-28px">
      <p class="text-red">{$value}</p>
    </div>
  );

}
