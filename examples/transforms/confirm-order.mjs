/**
 * Example transform: builds the confirm-order request path dynamically using
 * the orderId returned from the createOrder step. Demonstrates the "full
 * control" escape hatch for cases that simple {{...}} templates can't express.
 */
export function buildConfirmRequest(ctx) {
	const orderId = ctx.steps.createOrder.body.orderId;
	return {
		path: `/orders/${orderId}`,
		query: { verbose: "true" },
	};
}
