'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { ArrowLeft, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { StockDraftForm, type StockDraft } from '@/components/admin/StockDraftForm';

type Option = { id: string; name: string };
type Media = { id: string; storage_path: string; sort_order: number; alt_text: string | null };
type Gender = 'MEN' | 'WOMEN' | 'UNISEX' | 'KIDS';
type Draft = {
  id: string;
  name: string;
  brand_id: string;
  category_id: string;
  description: string | null;
  model: string | null;
  sku: string | null;
  colorway: string | null;
  release_year: number | null;
  gender: string | null;
  active: boolean;
  style_code?: string | null;
  product_media: Media[];
};

const field =
  'w-full rounded-xl border border-black/15 bg-white px-4 py-3 text-sm outline-none focus:border-[#065f46] focus:ring-2 focus:ring-[#065f46]/10';
const label = 'block text-[10px] font-bold uppercase tracking-widest text-black/60';

function imageUrl(path: string) {
  if (path.startsWith('/')) return path;
  const client = createClient();
  return client.storage.from('product-images').getPublicUrl(path).data.publicUrl;
}

export function ProductEditor({
  product,
  brands,
  categories,
  stock = [],
  compact = false,
  canAuthenticate = false,
}: {
  product?: Draft;
  brands: Option[];
  categories: Option[];
  stock?: StockDraft[];
  compact?: boolean;
  canAuthenticate?: boolean;
}) {
  const router = useRouter();
  const [productId, setProductId] = useState(product?.id ?? '');
  const [name, setName] = useState(product?.name ?? '');
  const [brandId, setBrandId] = useState(product?.brand_id ?? '');
  const [categoryId, setCategoryId] = useState(product?.category_id ?? '');
  const [description, setDescription] = useState(product?.description ?? '');
  const [model, setModel] = useState(product?.model ?? '');
  const [sku, setSku] = useState(product?.sku ?? '');
  const [styleCode, setStyleCode] = useState(product?.style_code ?? '');
  const [colorway, setColorway] = useState(product?.colorway ?? '');
  const [releaseYear, setReleaseYear] = useState(product?.release_year?.toString() ?? '');
  const [gender, setGender] = useState<Gender | ''>(
    product?.gender && ['MEN', 'WOMEN', 'UNISEX', 'KIDS'].includes(product.gender)
      ? (product.gender as Gender)
      : ''
  );
  const [brandOptions, setBrandOptions] = useState(brands);
  const [categoryOptions, setCategoryOptions] = useState(categories);
  const [newBrand, setNewBrand] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [media, setMedia] = useState<Media[]>(
    [...(product?.product_media ?? [])].sort((a, b) => a.sort_order - b.sort_order)
  );
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function addTaxonomy(kind: 'brand' | 'category') {
    const value = kind === 'brand' ? newBrand : newCategory;
    if (!value.trim()) return;
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/admin/taxonomy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, name: value }),
      });
      const result = (await response.json()) as Option & { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Could not add option.');
      if (kind === 'brand') {
        setBrandOptions((current) =>
          [...current, result].sort((a, b) => a.name.localeCompare(b.name))
        );
        setBrandId(result.id);
        setNewBrand('');
      } else {
        setCategoryOptions((current) =>
          [...current, result].sort((a, b) => a.name.localeCompare(b.name))
        );
        setCategoryId(result.id);
        setNewCategory('');
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not add option.');
    } finally {
      setBusy(false);
    }
  }

  async function uploadImages(id: string, selected: File[]) {
    const client = createClient();
    for (const [index, file] of selected.entries()) {
      const extension =
        file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/png' ? 'png' : 'webp';
      const path = `${id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await client.storage
        .from('product-images')
        .upload(path, file, { contentType: file.type, upsert: false });
      if (uploadError) {
        setFiles(selected.slice(index));
        throw new Error(`Could not upload ${file.name}: ${uploadError.message}`);
      }
      const { data, error: mediaError } = await client
        .from('product_media')
        .insert({
          product_id: id,
          storage_path: path,
          media_type: 'IMAGE',
          sort_order: media.length + index,
          alt_text: `${name} — photo ${media.length + index + 1}`,
        })
        .select('id, storage_path, sort_order, alt_text')
        .single();
      if (mediaError || !data) {
        await client.storage.from('product-images').remove([path]);
        setFiles(selected.slice(index));
        throw new Error(`Could not attach ${file.name} to the draft.`);
      }
      setMedia((current) => [...current, data]);
    }
    setFiles([]);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (
      files.some(
        (file) =>
          !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
          file.size > 10 * 1024 * 1024
      )
    ) {
      setError('Use PNG, JPEG, or WebP images under 10 MB each.');
      return;
    }
    setBusy(true);
    let id = productId;
    try {
      const response = await fetch(id ? `/api/admin/products/${id}` : '/api/admin/products', {
        method: id ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          brandId,
          categoryId,
          description,
          model,
          sku,
          styleCode,
          colorway,
          releaseYear: releaseYear ? Number(releaseYear) : null,
          gender: gender || null,
        }),
      });
      const result = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !result.id)
        throw new Error(result.error ?? 'Could not save product draft.');
      id = result.id;
      setProductId(id);
      if (files.length) await uploadImages(id, files);
      if (!product) {
        router.push(`/admin/products/${id}`);
      } else {
        setSuccess('Draft saved. It is still hidden from shoppers.');
        router.refresh();
      }
    } catch (cause) {
      setError(
        `${id ? 'The draft exists. ' : ''}${cause instanceof Error ? cause.message : 'Could not save product draft.'}`
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(item: Media) {
    if (!productId || !window.confirm('Remove this photo from the draft?')) return;
    setBusy(true);
    setError('');
    try {
      const client = createClient();
      const { error: deleteError } = await client
        .from('product_media')
        .delete()
        .eq('id', item.id)
        .eq('product_id', productId);
      if (deleteError) throw deleteError;
      if (item.storage_path.startsWith(`${productId}/`)) {
        const { error: storageError } = await client.storage
          .from('product-images')
          .remove([item.storage_path]);
        if (storageError)
          setError('Photo removed from the draft, but its storage file could not be cleaned up.');
      }
      setMedia((current) => current.filter((photo) => photo.id !== item.id));
      router.refresh();
    } catch {
      setError('Could not remove this photo.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className={compact ? 'text-[#17251f]' : 'px-4 pb-20 pt-8 text-[#17251f] sm:px-7 lg:px-10'}
    >
      <div className="mx-auto max-w-4xl">
        {!compact && (
          <Link
            href="/admin/products"
            className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-black/50 hover:text-black"
          >
            <ArrowLeft className="h-4 w-4" /> Products
          </Link>
        )}
        {!compact && (
          <>
            <p className="mt-10 text-[10px] font-bold uppercase tracking-[0.2em] text-[#065f46]">
              Unpublished catalog record
            </p>
            <h1 className="mt-2 text-4xl font-black tracking-[-0.06em] sm:text-6xl">
              {product ? 'EDIT DRAFT.' : 'NEW PRODUCT.'}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-black/55">
              {product?.active
                ? 'This product has a live listing. Unpublish it below before changing catalog details.'
                : 'Adding a product does not create sellable stock or verify authenticity. Pricing, condition, size, physical inspection, and publication remain separate.'}
            </p>
          </>
        )}

        <form onSubmit={save} className="mt-9 space-y-6">
          <fieldset disabled={Boolean(product?.active)} className="space-y-6">
            <div className="grid gap-5 rounded-[2rem] border border-black/10 bg-white p-6 sm:grid-cols-2 sm:p-8">
              <label className={`space-y-2 sm:col-span-2 ${label}`}>
                Product name *
                <input
                  className={field}
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  minLength={3}
                  maxLength={160}
                  required
                  placeholder="e.g. Prada Re-Nylon shoulder bag"
                />
              </label>
              <div className="space-y-2">
                <label htmlFor="brand" className={label}>
                  Brand *
                </label>
                <select
                  id="brand"
                  className={field}
                  value={brandId}
                  onChange={(event) => setBrandId(event.target.value)}
                  required
                >
                  <option value="">Choose brand</option>
                  {brandOptions.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    aria-label="New brand name"
                    className={field}
                    value={newBrand}
                    onChange={(event) => setNewBrand(event.target.value)}
                    placeholder="New brand"
                  />
                  <button
                    type="button"
                    onClick={() => void addTaxonomy('brand')}
                    disabled={busy || !newBrand.trim()}
                    className="rounded-xl border border-black/15 px-3 disabled:opacity-40"
                    aria-label="Add brand"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="category" className={label}>
                  Category *
                </label>
                <select
                  id="category"
                  className={field}
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  required
                >
                  <option value="">Choose category</option>
                  {categoryOptions.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    aria-label="New category name"
                    className={field}
                    value={newCategory}
                    onChange={(event) => setNewCategory(event.target.value)}
                    placeholder="New category"
                  />
                  <button
                    type="button"
                    onClick={() => void addTaxonomy('category')}
                    disabled={busy || !newCategory.trim()}
                    className="rounded-xl border border-black/15 px-3 disabled:opacity-40"
                    aria-label="Add category"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <label className={`space-y-2 sm:col-span-2 ${label}`}>
                Description
                <textarea
                  className={`${field} min-h-28 resize-y`}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={3000}
                  placeholder="Material, provenance, and details that have been confirmed"
                />
              </label>
              <label className={`space-y-2 ${label}`}>
                Model
                <input
                  className={field}
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  maxLength={120}
                />
              </label>
              <label className={`space-y-2 ${label}`}>
                Catalog SKU
                <input
                  className={field}
                  value={sku}
                  onChange={(event) => setSku(event.target.value)}
                  maxLength={100}
                />
              </label>
              <label className={`space-y-2 ${label}`}>
                Style code
                <input
                  className={field}
                  value={styleCode}
                  onChange={(event) => setStyleCode(event.target.value)}
                  maxLength={100}
                />
              </label>
              <label className={`space-y-2 ${label}`}>
                Colorway
                <input
                  className={field}
                  value={colorway}
                  onChange={(event) => setColorway(event.target.value)}
                  maxLength={120}
                />
              </label>
              <label className={`space-y-2 ${label}`}>
                Release year
                <input
                  type="number"
                  className={field}
                  value={releaseYear}
                  onChange={(event) => setReleaseYear(event.target.value)}
                  min={1900}
                  max={new Date().getFullYear() + 1}
                />
              </label>
              <div className="space-y-2">
                <label htmlFor="gender" className={label}>
                  Audience
                </label>
                <select
                  id="gender"
                  className={field}
                  value={gender}
                  onChange={(event) => setGender(event.target.value as Gender | '')}
                >
                  <option value="">Not specified</option>
                  <option value="MEN">Men</option>
                  <option value="WOMEN">Women</option>
                  <option value="UNISEX">Unisex</option>
                  <option value="KIDS">Kids</option>
                </select>
              </div>
            </div>

            {!compact && (
              <div className="rounded-[2rem] border border-black/10 bg-white p-6 sm:p-8">
                <div className="flex items-center gap-3">
                  <ImagePlus className="h-6 w-6 text-[#065f46]" />
                  <h2 className="text-xl font-black">Product photography</h2>
                </div>
                <p className="mt-2 text-sm text-black/55">
                  Choose individual PNG, JPEG, or WebP files, up to 10 MB each. Images are uploaded
                  after the draft is saved; nothing from your folder is imported automatically.
                </p>
                {media.length > 0 && (
                  <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {media.map((item) => (
                      <div
                        key={item.id}
                        className="relative aspect-square overflow-hidden rounded-2xl bg-[#efede6]"
                      >
                        <Image
                          src={imageUrl(item.storage_path)}
                          alt={item.alt_text ?? name}
                          fill
                          className="object-cover"
                          sizes="(max-width: 640px) 50vw, 25vw"
                        />
                        <button
                          type="button"
                          onClick={() => void removeImage(item)}
                          disabled={busy}
                          aria-label={`Remove photo ${item.sort_order + 1}`}
                          className="absolute right-2 top-2 rounded-full bg-white p-2 shadow-sm"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp"
                  aria-label="Product photos"
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                  className="mt-5 block w-full text-sm file:mr-4 file:rounded-full file:border-0 file:bg-black file:px-5 file:py-3 file:text-xs file:font-bold file:uppercase file:text-white"
                />
                {files.length > 0 && (
                  <p className="mt-2 text-xs text-black/50">
                    {files.length} photo{files.length === 1 ? '' : 's'} selected for upload.
                  </p>
                )}
              </div>
            )}
          </fieldset>

          {error && (
            <p role="alert" className="rounded-2xl bg-red-50 p-4 text-sm text-red-800">
              {error}{' '}
              {productId && !product && (
                <Link href={`/admin/products/${productId}`} className="underline">
                  Open the saved draft
                </Link>
              )}
            </p>
          )}
          {success && (
            <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-800">
              {success}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || Boolean(product?.active)}
            className="rounded-full bg-black px-8 py-4 text-xs font-bold uppercase tracking-wider text-white hover:bg-[#065f46] disabled:opacity-50"
          >
            {busy ? 'Saving…' : productId ? 'Save draft' : 'Create draft'}
          </button>
        </form>
        {product && !compact && (
          <StockDraftForm
            productId={product.id}
            initialStock={stock}
            productArchived={false}
            canAuthenticate={canAuthenticate}
          />
        )}
      </div>
    </section>
  );
}
