import { useEffect, useState } from "react";
export function useApi({ fn, deps }) {
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [loading, setLoading] = useState(false);
    useEffect(() => {
        let cancelled = false;
        void (async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await fn();
                if (!cancelled) {
                    setData(result);
                }
            }
            catch (e) {
                if (!cancelled) {
                    setError(e);
                }
            }
            finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, deps);
    const refetch = async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await fn();
            setData(result);
        }
        catch (e) {
            setError(e);
        }
        finally {
            setLoading(false);
        }
    };
    return { data, error, loading, refetch };
}
